<template>
    <n-message-provider>
        <router-view />
        <div class="footer">
            CopyRight &copy; {{ year }} yemaster. VERSION: 0.0.1 Beta
        </div>
    </n-message-provider>
</template>

<script>
import { NMessageProvider } from 'naive-ui'

export default {
    data() {
        return {
            year: new Date().getFullYear()
        }
    },
    components: {
        NMessageProvider
    }
}
</script>
