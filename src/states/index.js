import { defineStore } from "pinia";

export const useStore = defineStore('codelive', {
    state: () => {
        return {
            username: 'guest'
        }
    }
})