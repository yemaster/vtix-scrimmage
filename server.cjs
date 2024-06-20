/**
 * Codelive v0.0.1
 * /server.js
 * 
 * CopyRight 2023 (c) yemaster
 */


// Basic Configurations
// Set the host and port for the server to listen on
const host = process.env.HOST || '::'
const port = process.env.PORT || 8080
const devMode = false
const chatQueueMaxLength = 30

const appName = "Vtix Chaos"
const appVersion = "0.0.1"

const { join } = require("path")

// Create Fastify and set Static Directory
const fastify = require('fastify')
const app = fastify({
    logger: false,
})

app.register(require('@fastify/static'), {
    root: join(__dirname, 'dist'),
    prefix: '/'
})

app.get('/', (req, rep) => {
    rep.sendFile("index.html")
})

const socketio = require('fastify-socket.io')
app.register(socketio, {
    cors: true,
    options: {
        maxPayload: 1048576
    }
})

// 读取题库
const problemSet = require("./data/2024jdsgy.json").problems;

let isMatching = false;

function startMatch(mode) {
    if (isMatching)
        return;
    isMatching = true;
    while (prepareQueue[mode].length >= 2) {
        let pos1 = Math.floor(Math.random() * prepareQueue[mode].length);
        let player1 = prepareQueue[mode][pos1];
        prepareQueue[mode].splice(pos1, 1);
        let pos2 = Math.floor(Math.random() * prepareQueue[mode].length);
        let player2 = prepareQueue[mode][pos2];
        prepareQueue[mode].splice(pos2, 1);
        const game = new gameInstance(player1, player2);
        gameInstances[game.gameId] = game;
        userGameId[player1] = game.gameId;
        userGameId[player2] = game.gameId;
        app.io.emit("start-match", mode, game.gameId, player1, player2);
    }
    isMatching = false;
}

/**
 * Show Start Info
 */
function startPage() {
    console.log("     __  __  ______  ______  ____");
    console.log("    /\\ \\/\\ \\/\\  ___\\/\\__  _\\/\\  _`\\");
    console.log("    \\ \\ \\ \\ \\ \\ \\__/\\/_/\\ \\/\\ \\ \\/\\_\\");
    console.log("     \\ \\ \\ \\ \\ \\___``\\ \\ \\ \\ \\ \\ \\/_/_");
    console.log("      \\ \\ \\_\\ \\/\\ \\L\\ \\ \\ \\ \\ \\ \\ \\L\\ \\");
    console.log("       \\ \\_____\\ \\____/  \\ \\_\\ \\ \\____/");
    console.log("        \\/_____/\\/___/    \\/_/  \\/___/");
    console.log(`${appName} - v${appVersion}`)
    console.log("----------------------")
}

// Store Each Room Info
let playerList = []

let userGameId = {};
let gameInstances = {};
let prepareQueue = [[], []];

class gameInstance {
    constructor(p1, p2) {
        this.player1 = p1;
        this.player2 = p2;
        this.player1Score = 0;
        this.player2Score = 0;
        this.stage = 0;
        this.gameId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        // 从ProblemSet中随机选取15道不同的题目
        const copiedProblem = [...problemSet];
        this.problems = [];
        for (let i = 0; i < 15; i++) {
            let pos = Math.floor(Math.random() * copiedProblem.length);
            this.problems.push(copiedProblem[pos]);
            copiedProblem.splice(pos, 1);
        }
        this.currentProblem = 0;
        this.locked = false;
    }

    end(player) {
        app.io.emit("end-match", this.gameId, player);
        delete userGameId[this.player1];
        delete userGameId[this.player2];
        delete gameInstances[this.gameId];
    }
}

app.listen({ port, host }, (err, add) => {
    if (err) {
        fastify.log.error(err)
        process.exit(1)
    }
    startPage()
    console.log(`App is running at ${add}!`)

    // Socket.io system
    app.io.on('connection', socket => {
        socket.on("update-user", username => {
            let pos = -1;
            for (let i = 0; i < playerList.length; i++) {
                if (playerList[i].id === socket.id) {
                    pos = i;
                    break;
                }
            }
            if (pos === -1) {
                playerList.push({
                    id: socket.id,
                    username: username
                })
            } else {
                playerList[pos].username = username
            }
            app.io.emit("update-user", playerList);
        });

        // Disconnect
        socket.on("disconnect", () => {
            let pos = -1;
            for (let i = 0; i < playerList.length; i++) {
                if (playerList[i].id === socket.id) {
                    pos = i;
                    break;
                }
            }
            if (pos !== -1) {
                playerList.splice(pos, 1);
            }

            // 退出了取消匹配
            for (let i = 0; i < prepareQueue.length; i++) {
                let pos = prepareQueue[i].indexOf(socket.id);
                if (pos !== -1) {
                    prepareQueue[i].splice(pos, 1);
                }
            }

            // 如果还在游戏中，直接判负
            if (userGameId[socket.id]) {
                gameInstances[userGameId[socket.id]].end(socket.id === gameInstances[userGameId[socket.id]].player1 ? gameInstances[userGameId[socket.id]].player2 : gameInstances[userGameId[socket.id]].player1);
            }
            app.io.emit("update-user", playerList);
        });

        // Chat
        socket.on('chat', (m) => {
            app.io.emit("chat", { i: socket.id, c: m })
        })

        socket.on("prepare", (e) => {
            for (let i = 0; i < prepareQueue.length; i++) {
                let pos = prepareQueue[i].indexOf(socket.id);
                if (pos !== -1) {
                    prepareQueue[i].splice(pos, 1);
                }
            }
            if (e >= 0)
                prepareQueue[e].push(socket.id);
            app.io.emit("prepare", e, socket.id);

            if (e >= 0 && prepareQueue[e].length >= 2) {
                startMatch(e);
            }
        })

        socket.on("query-problem", (problemId) => {
            const gameId = userGameId[socket.id];
            if (!gameId) return;
            const game = gameInstances[gameId];
            if (game.locked) return;
            if (game.currentProblem !== problemId) return;

            const problem = { ...game.problems[problemId] };
            delete problem.answer;

            socket.emit("problem-info", problemId, game.problems[problemId]);
        })

        socket.on("submit-answer", (problemId, answer) => {
            const gameId = userGameId[socket.id];
            if (!gameId) return;
            const game = gameInstances[gameId];
            if (game.locked) return;
            if (game.currentProblem !== problemId) return;

            game.currentProblem++;

            const problem = game.problems[problemId];

            let right = false;
            if (problem.type === 1 || problem.type === 4) {
                if (problem.answer === answer[0]) {
                    right = true;
                }
            }
            else if (problem.type === 2) {
                // 多选题，判断problem.answer和answer是否一致
                if (problem.answer.length === answer.length) {
                    right = true;
                    for (let i = 0; i < problem.answer.length; i++) {
                        if (problem.answer.indexOf(answer[i]) === -1) {
                            right = false;
                            break;
                        }
                    }
                }
            }
            else if (problem.type === 3) {
                // 填空题，先不写了
            }
            let rightPlayer = 2;
            if ((right && socket.id === game.player1) || (!right && socket.id !== game.player1)) {
                rightPlayer = 1;
            }

            if (rightPlayer === 1) {
                game.player1Score++;
            }
            else {
                game.player2Score++;
            }

            if (game.player1Score === 8)
                game.end(game.player1);
            else if (game.player2Score === 8)
                game.end(game.player2);

            app.io.to(game.player1).to(game.player2).emit("submit-answer", problemId, answer, problem.answer, right, socket.id, game.player1Score, game.player2Score);
        })
    })
})