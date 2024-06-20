<script setup>
///// Variable Definition
// Naive-ui components
import { NButton, NSplit, NTabs, NTabPane, NPopover, NAvatar, NDivider, NCard, NRadioGroup, NRadio, NScrollbar, NList, NListItem, NInput, NIcon, NSelect, useMessage } from 'naive-ui'
import { MenuSharp, CloseOutline } from '@vicons/ionicons5';

import axios from 'axios';

// monaco-editor units
import * as monaco from 'monaco-editor'
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution'

import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

import { onBeforeUnmount, nextTick, ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'

// result dom
const resultShow = ref()

// code Content
const codeContent = ref(`<!DOCTYPE html>
<html>

<body style='margin:0'>
    <p style='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:42px;font-weight:300'>U5TC
        CodeLive</p>
</body>

</html>`)
const lastCodeVersion = ref(0)
const lastSendCode = ref("")
let rCodeReserve = []

// Socket.io
import { io } from "socket.io-client"

const connected = ref(false)
let socket

// Monaco-Editor Instance
let editor
// Monaco-Editor Themes
//import { tomorrow, tomorrowNight, textmate } from "@/libs/editor-themes"
const nowTheme = ref("vs")
//const editorThemes = ref([{ label: "tomorrow", value: "tomorrow", v: tomorrow },
//{ label: "tomorrow-night", value: "tomorrow-night", v: tomorrowNight },
//{ label: "Textmate", value: "textmate", v: textmate }])
const editorThemes = ref([{ label: "vs", value: "vs" }, { label: "vs-dark", value: "vs-dark" }])

// Editor Settings
const settingsShow = ref(false)
const combineDirection = ref("horizontal") // Code View Direction
const tabPosition = ref("top")             // Tab Position
const isDragging = ref(false)              // Is Dragging

// pinia Store
import { useStore } from '@/states'
const store = useStore()
// Read username from local
if (localStorage && localStorage.u5tcname)
    store.username = localStorage.u5tcname

const route = useRoute()
// Room info and user info
const roomId = ref(route.params.id)
const userInfo = ref({
    username: store.username
})
const roomInfo = ref({
    rid: route.params.id,
    share: null,
    members: [],
    code: "",
})

// Message Queue
const popMessage = useMessage()
const messages = ref([])
const messageBox = ref()
const chatMessage = ref("")
const memberMap = {}

//// Patience Diff
import { patienceDiff } from '@/libs/PatienceDiff'

// monaco-editor worker getter
self.MonacoEnvironment = {
    getWorker(_, label) {
        if (label === 'html' || label === 'handlebars' || label === 'razor') {
            return new htmlWorker()
        }
        return new editorWorker()
    },
}

// Update Iframe value when code changes
function updateIframe() {
    codeContent.value = editor.getValue();
    if (resultShow?.value) {
        const ifr = document.createElement("iframe")
        ifr.setAttribute("frameborder", "0")
        ifr.setAttribute("id", "iframeResult")
        ifr.setAttribute("width", "100%")
        ifr.setAttribute("height", "100%")
        resultShow.value.innerHTML = ""
        resultShow.value.appendChild(ifr)
        const ifrw = (ifr.contentWindow) ? ifr.contentWindow : (ifr.contentDocument.document) ? ifr.contentDocument.document : ifr.contentDocument
        ifrw.document.open()
        ifrw.document.write(codeContent.value)
        ifrw.document.close()
    }
}

// Calculate How to send code
function calcSendCode() {
    //console.log("Last Code Version:", lastCodeVersion.value)
    const diff = patienceDiff(lastSendCode.value.split("\n"), codeContent.value.split("\n"))
    let diffLines = []
    diff.lines.forEach(o => {
        if (o.aIndex < 0)
            diffLines.push({ t: "a", c: o.line, p: o.bIndex })
        else if (o.bIndex < 0)
            diffLines.push({ t: "d", p: o.aIndex })
    })
    lastCodeVersion.value++
    lastSendCode.value = codeContent.value
    socket.emit("update-code", { d: diffLines, v: lastCodeVersion.value })
}

// Receive Send Code
let updateLock = false
function updateCode() {
    if (updateLock)
        return
    updateLock = true
    let nowVersion = lastCodeVersion.value
    let p = rCodeReserve.findIndex(v => v.v === nowVersion + 1)
    let codeSlice = codeContent.value.split("\n")
    while (p !== -1) {
        let codeDiff = rCodeReserve[p].d
        //console.log(rCodeReserve[p])
        let addCount = 0, deleteCount = 0
        codeDiff.forEach(i => {
            // Add a Line
            if (i.t === 'a') {
                codeSlice.splice(i.p, 0, i.c)
                addCount++
            }
            // Delete a Line
            else {
                //console.log(i.p - deleteCount + addCount)
                codeSlice.splice(i.p - deleteCount + addCount, 1)
                deleteCount++
            }
            //console.log(i)
            //console.log(codeSlice)
        })
        lastCodeVersion.value++
        nowVersion = lastCodeVersion.value
        rCodeReserve.splice(p, 1)
        p = rCodeReserve.findIndex(v => { v.v === nowVersion + 1 })
    }
    codeContent.value = codeSlice.join("\n")
    editor.setValue(codeContent.value)
    updateLock = false
}

function receiveSendCode(d) {
    rCodeReserve.push(d)
    updateCode()
}

// Init editor
const editorInit = () => {
    nextTick(() => {
        for (let i of editorThemes.value)
            if (i.v)
                monaco.editor.defineTheme(i.label, i.v)
        if (!editor) {
            editor = monaco.editor.create(document.getElementById('codeEditor'), {
                value: codeContent.value,
                language: 'html',
                theme: 'tomorrow',
                automaticLayout: true,
                readOnly: false,
                fontSize: 14,
            })
        }
        else {
            editor.setValue(codeContent.value)
            editor.updateOptions({
                language: 'html',
                theme: 'vs',
            })
        }

        editor.onDidChangeModelContent(val => {
            updateIframe()
            //console.log(connected.value, roomInfo.value.share, socket.id,  roomInfo.value.share === socket.id)
            if (connected.value && roomInfo.value.share === socket.id) {
                calcSendCode()
            }
        })

        updateIframe()
    })
}

watch(() => nowTheme.value, (v) => {
    editor.updateOptions({
        theme: v
    })
})

editorInit()

// Add overlay on the iframe when dragging
function handleOnDragStart() {
    isDragging.value = true
}
function handleOnDragEnd() {
    isDragging.value = false
}

function updateEditorStatus(d) {
    if (d === socket.id || d === null) {
        editor.updateOptions({
            readOnly: false
        })
    }
    else {
        editor.updateOptions({
            readOnly: true
        })
    }
    if (d !== socket.id && d) {
        codeContent.value = ""
        editor.setValue("")
        rCodeReserve = []
        lastCodeVersion.value = 0
    }
}

onMounted(() => {
    axios.get("http://127.0.0.1:3000/vengine-uuid").then(res => {
        const uuid = res.data;
        console.log(uuid);
    }).catch(e => {
        console.log(e)
    })
    if (process.env.NODE_ENV === "development") {
        socket = io("http://127.0.0.1:3000")
    } else {
        socket = io()
    }
    socket.on("connect", () => {
        connected.value = true
        userInfo.value.id = socket.id
        socket.emit("update_room", roomId.value, userInfo.value)
    })
    socket.on("disconnect", () => {
        lastSendCode.value = ""
        lastCodeVersion.value = 0
        roomInfo.value = {
            rid: route.params.id,
            share: null,
            members: [],
            code: "",
        }
        connected.value = false
    })
    // Initialize room info
    socket.on("init-room", data => {
        roomInfo.value = data
        for (let i of roomInfo.value.members)
            memberMap[i.id] = i
        updateEditorStatus(roomInfo.value.share)
    })
    socket.on("init-code", data => {
        lastCodeVersion.value = data.v
        codeContent.value = data.c
        editor.setValue(codeContent.value)
        rCodeReserve = data.r
    })
    socket.on("update-share", data => {
        if (data) {
            const u = memberMap[data].username
            popMessage.info(`${u}开始分享代码`)
            messages.value.push({ t: 's', c: `${u}开始分享代码` })
        }
        else {
            const u = memberMap[roomInfo.value.share].username
            popMessage.info(`${u}结束分享代码`)
            messages.value.push({ t: 's', c: `${u}结束分享代码` })
        }
        roomInfo.value.share = data
        updateEditorStatus(data)
    })
    // Room member info update
    socket.on("update-member", data => {
        let pid = -1
        //console.log(data, roomInfo.value.members)
        memberMap[data.id] = data
        for (let i = 0; i < roomInfo.value.members.length; ++i)
            if (roomInfo.value.members[i].id === data.id) {
                pid = i
                break
            }
        if (pid === -1) {
            messages.value.push({ t: 's', c: `${data.username}进入了房间` })
            roomInfo.value.members.push(data)
        }
        else {
            for (let i in data)
                roomInfo.value.members[pid][i] = data[i]
        }
    })
    // Room member leave
    socket.on("leave-member", data => {
        const u = memberMap[data].username
        messages.value.push({ t: 's', c: `${u}退出了房间` })
        delete memberMap[data]
        roomInfo.value.members = roomInfo.value.members.filter(v => v.id !== data)
    })

    // Update Code
    socket.on("update-code", data => {
        if (roomInfo.value.share !== socket.id)
            receiveSendCode(data)
    })

    // Chat Message
    socket.on("chat", (d) => {
        d.t = "m"
        d.u = memberMap[d.i].username
        messages.value.push(d)
    })
    // System Notification
    socket.on("notification", (d) => {
        popMessage[d.t](d.c)
    })
})

function startShare() {
    if (connected.value) {
        socket.emit("update-share")
    }
    else {
        popMessage.error("暂未连接到后端，无法分享")
        return
    }
    lastCodeVersion.value = 0
    lastSendCode.value = ""
    calcSendCode()
}

function endShare() {
    if (connected.value) {
        socket.emit("end-share")
    }
    else {
        popMessage.error("暂未连接到后端，无法分享")
        return
    }
}

function sendMessage() {
    if (connected.value) {
        socket.emit("chat", chatMessage.value)
        chatMessage.value = ""
    }
    else {
        popMessage.error("暂未连接到后端，无法发送")
        return
    }
}

watch(() => messages.value.length, () => {
    messageBox?.value?.scrollTo({ top: 2100000 })
})

onBeforeUnmount(() => {
    // Disconnect socket before unmounted
    socket.disconnect()
})
</script>

<template>
    <div class="status-bar">
        <div class="ball" :class="{ red: !connected, green: connected }"></div>
        <span class="info">
            <template v-if="!connected">未连接</template>
            <template v-else-if="roomInfo.share">{{ memberMap[roomInfo.share].username }}的代码(共{{ roomInfo.members.length
            }}人观看)</template>
            <template v-else>无人分享</template>
        </span>
        <n-button strong secondary size="tiny" v-if="connected && !roomInfo.share" type="error"
            @click="startShare">我要分享</n-button>
        <n-button strong secondary size="tiny" v-if="connected && roomInfo.share === userInfo.id" type="success"
            @click="endShare">结束分享</n-button>
    </div>
    <n-split :direction="combineDirection" @drag-start="handleOnDragStart" @drag-end="handleOnDragEnd" style="height: 100vh"
        :min="0.25" :max="0.75">
        <template #1>
            <div id="codeEditor" style="height: 100%; width: 100%"></div>
        </template>
        <template #2>
            <div class="resultBox">
                <div class="resultMog" v-show="isDragging"></div>
                <div class="resultShow" ref="resultShow"></div>
            </div>
        </template>
    </n-split>
    <n-popover style="max-height: 60vh; height: 400px; width: 300px; padding: 0;" trigger="manual"
        content-style="height: 100%;" :show="settingsShow">
        <template #trigger>
            <n-button size="large" circle class="command-button" @click="settingsShow = !settingsShow">
                <template #icon>
                    <n-icon><close-outline v-if="settingsShow" /><menu-sharp v-else /></n-icon>
                </template>
            </n-button>
        </template>
        <n-tabs :placement="tabPosition" type="line" animated :tabs-padding="20"
            pane-wrapper-style="position: relative; height: 100%"
            pane-style="position: relative; padding: 0; height: 100%;">
            <n-tab-pane display-directive="show" name="chat" tab="聊天">
                <div style="height: 100%">
                    <n-scrollbar style="height:calc(100% - 34px);width: 100%;padding: 12px 20px;box-sizing: border-box;"
                        :x-scrollable="true" ref="messageBox">
                        <template v-for="m in messages">
                            <div v-if="m.t === 's'" class="v-message-system">
                                {{ m.c }}
                            </div>
                            <div v-else-if="m.i === userInfo.id" class="v-message me">
                                <div class="left">
                                    <div class="v-message-info">{{ m.u }}</div>
                                    <div class="v-message-content">{{ m.c }}</div>
                                </div>
                                <div class="v-message-avatar">
                                    <n-avatar round>
                                        {{ userInfo.username[0] }}
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
                    <n-input class="v-chatter" v-model:value="chatMessage" placeholder="输入以聊天" @keyup.enter="sendMessage"
                        :disabled="!connected"></n-input>
                </div>
            </n-tab-pane>
            <n-tab-pane display-directive="show" name="info" tab="信息">
                <n-scrollbar style="height: 100%;width: 100%;padding: 12px 20px;box-sizing: border-box;"
                    :x-scrollable="true">
                    <n-divider title-placement="left">
                        房间信息
                    </n-divider>
                    <n-card title="房间ID" size="small">
                        {{ roomId }}
                    </n-card>
                    <n-card title="代码分享者" size="small">
                        <template v-if="roomInfo.share">
                            {{ roomInfo.share }}
                        </template>
                        <template v-else>
                            还没人分享
                        </template>
                    </n-card>
                    <n-card title="观看者" size="small">
                        共{{ roomInfo.members.length }}人观看
                        <n-list>
                            <n-list-item v-for="(p, i) in roomInfo.members">
                                {{ p.username }}({{ p.id }})
                            </n-list-item>
                        </n-list>
                    </n-card>
                    <n-divider title-placement="left">
                        个人信息
                    </n-divider>
                    <n-card title="Socket ID" size="small">
                        {{ userInfo.id }}
                    </n-card>
                </n-scrollbar>
            </n-tab-pane>
            <n-tab-pane display-directive="show" name="settings" tab="设置">
                <n-scrollbar style="height: 100%;width: 100%;padding: 12px 20px;box-sizing: border-box;"
                    :x-scrollable="true">
                    <n-divider title-placement="left">
                        个人信息
                    </n-divider>
                    <n-card title="用户名" size="small">
                        <n-input v-model:value="userInfo.username" type="text" placeholder="输入用户名" />
                    </n-card>
                    <n-divider title-placement="left">
                        界面设置
                    </n-divider>
                    <n-card title="代码预览排布" size="small">
                        <n-radio-group v-model:value="combineDirection">
                            <n-radio label="横向" value="horizontal" />
                            <n-radio label="纵向" value="vertical" />
                        </n-radio-group>
                    </n-card>
                    <n-card title="标签页位置" size="small">
                        <n-radio-group v-model:value="tabPosition">
                            <n-radio label="左侧" value="left" />
                            <n-radio label="上侧" value="top" />
                            <n-radio label="右侧" value="right" />
                        </n-radio-group>
                    </n-card>
                    <n-divider title-placement="left">
                        编辑器设置
                    </n-divider>
                    <n-card title="编辑器主题" size="small">
                        <n-select placeholder="选择语言" filterable v-model:value="nowTheme" :options="editorThemes"></n-select>
                    </n-card>
                </n-scrollbar>
            </n-tab-pane>
        </n-tabs>
    </n-popover>
</template>

<style scoped>
.resultBox {
    position: relative;
    width: 100%;
    height: 100%;
}

.resultMog {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 100;
    background-color: transparent;
}

.resultShow {
    width: 100%;
    height: 100%;
}

.n-card {
    margin-top: 10px;
}

.command-button {
    position: fixed;
    bottom: 50px;
    right: 50px;
    border: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, .2);
}

.command-button:hover {
    border: none;
    box-shadow: 0 4px 8px rgba(0, 0, 0, .2);
}
</style>