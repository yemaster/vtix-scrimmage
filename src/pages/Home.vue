<script setup>
import { NAvatar, NBadge, NButton, NTag, NSpace, NIcon, NInputGroup, NInputGroupLabel, NInput, NTabs, NTabPane, NScrollbar, useMessage, NPopover, NTable, NProgress, NGrid, NGi } from 'naive-ui'
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { CheckmarkOutline, CloseOutline, MenuSharp } from '@vicons/ionicons5';

const message = useMessage();

// Socket.io
import { io } from "socket.io-client"

// lodash
import { debounce, now } from "lodash"

let socket
let userid = ref("")

const connected = ref(false);
const username = ref(localStorage.getItem("username") || "guest");
const onlineUsers = ref([]);

const matchModes = ["抢答战", "限时战"];
const problemTypes = ref(["送分题", "单选题", "多选题", "填空题", "判断题"]);
const choices = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
const matchingUsers = ref(Array.from({ length: matchModes.length }, () => []));

//
const settingsShow = ref(false);

// Message
const messages = ref([])
const messageBox = ref()
const chatMessage = ref("")
const memberMap = {}

// 游戏状态
const inGame = ref(false);
// Stage: 0 - Matching, 1 - Before Game, 2 - In Game, 3 - Game Over
const nowStage = ref(0);
const winner = ref(-1);
const nowGame = ref({
    mode: -1,
    id: "",
    p1: "",
    p2: "",
    p1Name: "",
    p2Name: "",
    p1Score: 0,
    p2Score: 0,
    problem: null,
    // problemState = 0: Waiting for answer
    // problemState = 1: I answer
    // problemState = 2: Opponent's answer
    problemState: 0,
    nowProblemId: -1,
});

const nowPrepare = ref(-1);

const nowAnswer = ref([]);
const right = ref(undefined);
let answerLock = false;


function choose(k) {
    if (answerLock)
        return;
    if (nowGame.value.problemState > 1)
        return
    if (nowGame.value.problem.type === 1 || nowGame.value.problem.type === 4) {
        nowAnswer.value = [k];
    }
    else {
        if (nowAnswer.value.indexOf(k) !== -1) {
            nowAnswer.value = nowAnswer.value.filter(v => v !== k)
        }
        else
            nowAnswer.value.push(k)
    }
}

function getChoiceClass(cs) {
    let isRight = false;
    let isWrong = false;
    if (right.value) {
        isRight = (right.value.indexOf(cs) !== -1);
        isWrong = ((right.value.indexOf(cs) === -1 && nowAnswer.value.indexOf(cs) !== -1) || (right.value.indexOf(cs) !== -1 && nowAnswer.value.indexOf(cs) === -1));
    }
    return {
        chosen: nowAnswer.value.indexOf(cs) !== -1,
        right: isRight,
        wrong: isWrong
    }
}

function submitAnswer() {
    if (answerLock)
        return;
    if (connected.value) {
        if (nowGame.value.problemState !== 0) {
            message.error("该题无法被作答!");
            return;
        }
        socket.emit("submit-answer", nowGame.value.nowProblemId, nowAnswer.value);
    }
    else {
        message.error("暂未连接到后端，无法提交答案");
    }
}

function prepare(mode) {
    if (connected.value) {
        if (mode === nowPrepare.value)
            nowPrepare.value = -1;
        else {
            nowPrepare.value = mode;
        }
        socket.emit("prepare", nowPrepare.value);
    }
    else {
        nowPrepare.value = -1;
        message.error("暂未连接到后端，无法匹配");
    }
}

function updateUsername() {
    localStorage.setItem("username", username.value);
    if (connected.value) {
        socket.emit("update-user", username.value);
    }
    else {
        message.error("还没有连接到服务器!")
    }
}

const debouncedUpdateUsername = debounce(updateUsername, 800)


function sendMessage() {
    if (connected.value) {
        socket.emit("chat", chatMessage.value)
        chatMessage.value = ""
    }
    else {
        message.error("暂未连接到后端，无法发送")
        return
    }
}

function returnHome() {
    nowStage.value = 0;
    nowPrepare.value = -1;
}

function askForNextProblem() {
    if (nowStage.value === 1 || nowStage.value === 2) {
        nowStage.value = 2;
        nowGame.value.nowProblemId++;
        fogShow.value = true;
        fogText.value = `准备第${nowGame.value.nowProblemId + 1}题`;
        setTimeout(() => {
            if (nowStage.value === 1 || nowStage.value === 2) {
                socket.emit("query-problem", nowGame.value.nowProblemId);
            }
        }, 1000)
    }
    nowAnswer.value = [];
    right.value = undefined;
}

const fogShow = ref(false);
const fogText = ref("2333");

function onKeyDown(e) {
    if (!nowGame.value.problem)
        return;
    const tmp = e.key.toUpperCase()
    const pos = choices.indexOf(tmp)
    const qwerty = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P']
    const pos2 = qwerty.indexOf(tmp)
    //console.log(tmp)
    if (tmp == "ENTER") {
        submitAnswer();
        e.preventDefault()
    }
    else if (nowGame.value.problem.choices) {
        if (pos2 != -1 && pos2 >= 0 && pos2 < nowGame.value.problem.choices.length)
            choose(pos2)
        else if (pos != -1 && pos >= 0 && pos < nowGame.value.problem.choices.length)
            choose(pos)
    }
}

onMounted(() => {
    window.addEventListener("keydown", onKeyDown);

    if (process.env.NODE_ENV === "development") {
        socket = io("http://127.0.0.1:8080");
    } else {
        socket = io();
    }

    // Connect
    socket.on("connect", () => {
        connected.value = true;
        userid.value = socket.id;
        matchingUsers.value = Array.from({ length: matchModes.length }, () => []);
        inGame.value = false;
        nowStage.value = 0;
        nowPrepare.value = -1;

        // Update myself:
        socket.emit("update-user", username.value);
    })

    // Disconnect
    socket.on("disconnect", () => {
        connected.value = false;
        nowStage.value = 0;
        nowPrepare.value = -1;
    });

    // Update User List
    socket.on("update-user", (userList) => {
        onlineUsers.value = userList;
        userList.forEach((user) => {
            memberMap[user.id] = user;
        });
    });

    // Chat
    socket.on("chat", (d) => {
        d.t = "m"
        d.u = memberMap[d.i].username
        messages.value.push(d)
    })

    // Prepare
    socket.on("prepare", (mode, player) => {
        for (let i = 0; i < matchingUsers.value.length; ++i) {
            let pos = matchingUsers.value[i].indexOf(player);
            if (pos !== -1) {
                matchingUsers.value[i].splice(pos, 1);
            }
        }
        if (mode >= 0)
            matchingUsers.value[mode].push(player);
    })

    // Start Match
    socket.on("start-match", (mode, gameId, p1, p2) => {
        for (let i = 0; i < matchingUsers.value.length; ++i) {
            let pos = matchingUsers.value[i].indexOf(p1);
            if (pos !== -1) {
                matchingUsers.value[i].splice(pos, 1);
            }
            pos = matchingUsers.value[i].indexOf(p2);
            if (pos !== -1) {
                matchingUsers.value[i].splice(pos, 1);
            }
        }
        if (p1 === userid.value || p2 === userid.value) {
            message.success("匹配成功，即将进入游戏");
            nowStage.value = 1;
            if (p2 === userid.value) {
                // Swap
                let tmp = p1;
                p1 = p2;
                p2 = tmp;
            }
            nowGame.value = {
                mode,
                id: gameId,
                p1,
                p2,
                p1Name: username.value,
                p2Name: memberMap[p2].username,
                p1Score: 0,
                p2Score: 0,
                problem: null,
                problemState: 0,
                nowProblemId: -1
            };
            setTimeout(askForNextProblem, 3000);
        }
    });

    socket.on("end-match", (gameId, w) => {
        if (gameId === nowGame.value.id) {
            nowStage.value = 3;
            winner.value = w;
        }
    })

    socket.on("problem-info", (id, problemInfo) => {
        answerLock = false;
        fogShow.value = false;
        if (id === nowGame.value.nowProblemId) {
            nowGame.value.problem = problemInfo;
        }
    });

    socket.on("submit-answer", (problemId, answer, rightAnswer, isRight, answerPlayer, player1Score, player2Score) => {
        answerLock = true;
        nowGame.value.nowProblemId = problemId;
        nowAnswer.value = answer;
        if (typeof rightAnswer === "number")
            right.value = [rightAnswer];
        else
            right.value = rightAnswer;

        fogShow.value = true;
        let info = "";
        if (answerPlayer === userid.value)
            info = "您 作答";
        else
            info = "对手 作答";
        if (isRight) {
            fogText.value = info + " 正确！";
        }
        else {
            fogText.value = info + " 错误！";
        }

        if ((answerPlayer === userid.value && isRight) || (answerPlayer !== userid.value && !isRight)) {
            nowGame.value.p1Score++;
        }
        else {
            nowGame.value.p2Score++;
        }

        setTimeout(() => { fogShow.value = false }, 500);
        setTimeout(askForNextProblem, 1500);
    });
})

onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeyDown);
    // Disconnect socket before unmounted
    socket.disconnect()
})
</script>

<template>
    <div class="show" v-if="nowStage === 3">
        <template v-if="winner === userid">
            <h1>您打败了{{ nowGame.p2Name }}!</h1>
        </template>
        <template v-else>
            <h1>您被{{ nowGame.p2Name }}打败了，请再接再厉!</h1>
        </template>
        <button class="main-button" @click="returnHome">返回</button>
    </div>
    <div class="v-container" v-if="nowStage === 2">
        <div class="fog" v-show="fogShow"><span class="text">{{ fogText }}</span></div>
        <h2>史纲题库大乱斗 - {{ matchModes[nowGame.mode] }}</h2>
        <n-grid x-gap="12" :cols="2">
            <n-gi>
                我的进度
                <n-progress type="line" :percentage="nowGame.p1Score * 12.5" :indicator-placement="'inside'"
                    processing />
            </n-gi>
            <n-gi>
                {{ nowGame.p2Name }}的进度
                <n-progress type="line" :percentage="nowGame.p2Score * 12.5" :indicator-placement="'inside'"
                    processing />
            </n-gi>
        </n-grid>
        <template v-if="nowGame.problem">
            <div class="v-problem-header">
                <div class="v-tag problem-info">{{ problemTypes[nowGame.problem.type]
                    }}</div>
                <span class="v-problem-title">
                    &nbsp;{{ nowGame.nowProblemId + 1 }}.
                    <span v-text="nowGame.problem.content"></span>
                </span>
            </div>
            <div class="v-problem-answer">
                <template v-if="nowGame.problem.type === 3">
                    <div class="form-group">
                        <input class="v-input" placeholder="多个答案之间用逗号隔开！">
                    </div>
                </template>
                <template v-else>
                    <span class="v-choose-box" v-for="(c, i) in nowGame.problem.choices" v-bind:key="i"
                        @click="choose(i)" :class="getChoiceClass(i)">
                        {{ choices[i] }}. {{ c }}</span>
                </template>
            </div>
            <div class="v-button-area">
                <n-space>
                    <n-button strong secondary type="info" @click="submitAnswer" :disabled="nowGame.problemState !== 0">
                        确定
                    </n-button>
                    <!--n-button strong secondary>
                        <template v-if="nowGame.problemState === 0">等待作答</template>
                        <template v-if="nowGame.problemState === 1">成功抢答</template>
                    </n-button-->
                </n-space>
            </div>
        </template>
    </div>
    <div class=show v-if="nowStage === 1">
        <h1>准备开始 {{ matchModes[nowGame.mode] }}!</h1>
        <div class="info">
            您的对手是 {{ nowGame.p2Name }}，即将进入对战！
        </div>
    </div>
    <div class="show" v-if="nowStage === 0">
        <h1>史纲题库大乱斗<n-tag type="error">限时开启</n-tag></h1>
        <div class="info">
            <template v-if="connected">
                <n-space justify="center">
                    <div class="icon-span">
                        <n-icon :size="30" color="#47af50">
                            <CheckmarkOutline />
                        </n-icon>
                        <span style="color: #47af50">
                            已连接
                        </span>
                    </div>
                    <n-tag size="large" type="info">
                        在线人数：{{ onlineUsers.length }}
                    </n-tag>
                </n-space>
            </template>
            <template v-else>
                <div class="icon-span">
                    <n-icon :size="30" color="#db2828">
                        <CloseOutline />
                    </n-icon>
                    <span style="color: #db2828">
                        未连接到服务器
                    </span>
                </div>
            </template>
        </div>
        <n-input-group style="justify-content: center;">
            <n-input-group-label size="large">俺的大名</n-input-group-label>
            <n-input size="large" style="max-width: 300px; margin-bottom: 20px;" v-model:value="username"
                @input="debouncedUpdateUsername"></n-input>
        </n-input-group>
        <n-space justify="center">
            <n-badge v-for="(tp, i) in matchModes" :key="i" :value="matchingUsers[i].length" :offset="[0, 10]">
                <button class="main-button" :class="{ grey: nowPrepare === i }" @click="prepare(i)">
                    <template v-if="nowPrepare === i">取消</template>
                    {{ tp }}
                </button>
            </n-badge>
        </n-space>
    </div>
    <n-popover style="max-height: 60vh; height: 400px; width: 300px; padding: 0;" trigger="manual"
        content-style="height: 100%;" :show="settingsShow">
        <template #trigger>
            <n-button size="large" circle class="command-button" @click="settingsShow = !settingsShow">
                <template #icon>
                    <n-icon><close-outline v-if="settingsShow" /><menu-sharp v-else /></n-icon>
                </template>
            </n-button>
        </template>
        <n-tabs type="line" animated :tabs-padding="20" pane-wrapper-style="position: relative; height: 100%"
            pane-style="position: relative; padding: 0; height: 100%;">
            <n-tab-pane display-directive="show" name="chat" tab="聊天">
                <div style="height: 100%">
                    <n-scrollbar style="height:calc(100% - 34px);width: 100%;padding: 12px 20px;box-sizing: border-box;"
                        :x-scrollable="true">
                        <template v-for="m in messages">
                            <div v-if="m.t === 's'" class="v-message-system">
                                {{ m.c }}
                            </div>
                            <div v-else-if="m.i === userid" class="v-message me">
                                <div class="left">
                                    <div class="v-message-info">{{ username }}</div>
                                    <div class="v-message-content">{{ m.c }}</div>
                                </div>
                                <div class="v-message-avatar">
                                    <n-avatar round>
                                        {{ username[0] }}
                                    </n-avatar>
                                </div>
                            </div>
                            <div v-else class="v-message">
                                <div class="v-message-avatar">
                                    <n-avatar round>
                                        {{ m.u[0] }}
                                    </n-avatar>
                                </div>
                                <div class="right">
                                    <div class="v-message-info">{{ m.u }}</div>
                                    <div class="v-message-content">{{ m.c }}</div>
                                </div>
                            </div>
                        </template>
                    </n-scrollbar>
                    <n-input class="v-chatter" v-model:value="chatMessage" placeholder="输入以聊天"
                        @keyup.enter="sendMessage" :disabled="!connected"></n-input>
                </div>
            </n-tab-pane>
            <n-tab-pane display-directive="show" name="userlist" tab="在线用户">
                <div style="height: 100%">
                    <n-scrollbar style="height:calc(100% - 34px);width: 100%;padding: 12px 20px;box-sizing: border-box;"
                        :x-scrollable="true">
                        <n-table>
                            <thead>
                                <tr>
                                    <th>用户名</th>
                                    <th>状态</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="u in onlineUsers" :key="u.id">
                                    <td>{{ u.username }}</td>
                                    <td>暂时不可查看</td>
                                </tr>
                            </tbody>
                        </n-table>
                    </n-scrollbar>
                </div>
            </n-tab-pane>
        </n-tabs>
    </n-popover>
</template>