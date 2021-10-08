const got = require('got')
const { v4: uuidv4 } = require('uuid')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const URL_HTTP_JANUS_PREFIX = "http://"
const URL_HTTP_JANUS_SUFIX = "/janus/"
const event = require('./event')

const janusHttpTransportApi = {
    getTransaction() {
        return uuidv4()
    },
    buildUrl(host, path) {
        return URL_HTTP_JANUS_PREFIX+host+URL_HTTP_JANUS_SUFIX+path
    },
    async post(host, path, payload, secret) {
        const url = this.buildUrl(host, path)
        if(!payload.transaction) {
            payload.transaction = this.getTransaction()
        }
        payload.apisecret = secret
        const {body} = await got.post(url, {
            json: payload,
            responseType: 'json'
        })
        return body
    },
    async get(host, path, secret) {
        const url = this.buildUrl(host, path)+"?apisecret="+secret
        const {body} = await got.get(url)
        return JSON.parse(body)
    }
}

const Handler = class {
    constructor(janus, handler) {
        this.janus = janus
        this.handler = handler
        this.type = null
        this.room = null
        this.id = null
    }
}

module.exports = class {
    constructor(payload) {
        this.host = payload.host
        this.secret = payload.secret
        this.session = null                     // Janus Session id
        this.handlers = []                      // Janus plugin handler's id (streaming)
        this.handler = null
        this.killed = false
        this.crashed = 0
    }

    /* Private */

    async createSession() {
        const path = ""
        const result = await janusHttpTransportApi.post(this.host, path, {
            "janus" : "create"
        }, this.secret)
        if(!result.janus === "success" || ! result.data) {
            console.log('Err init janus')
            return false
        }else{
            this.session = result.data.id
        }
        return true
    }

    async createHandler() {
        const path = this.session+"/"
        const result = await janusHttpTransportApi.post(this.host, path, {
            "janus" : "attach",
            "plugin" : "janus.plugin.streaming"
        }, this.secret)
        if(!result.janus === "success" || ! result.data) {
            console.log('Err handler janus')
            return false
        }
        const handler = new Handler(this, result.data.id)
        this.handlers.push(handler)
        return handler
    }

    async destroySession() {
        const path = this.session+"/"
        const result = await janusHttpTransportApi.post(this.host, path, {
            "janus" : "destroy"
        }, this.secret)
        if(!result.janus === "success") {
            console.log('Err destroying janus session')
            return false
        }else{
            this.session = null
        }
        return true 
    }

    async runner() {
        let err = 0
        while(!this.killed) {
            console.log('JANUS WORKER '+this.host)
            if(err >= 2 && this.crashed >= 3) {
                this.destroy(this.host)
                return
            }else if(err >= 2) {
                this.crashed ++
                this.init()
                console.log('Err Janus 2/2. ReInit')
                return
            }else{
                const path = this.session
                let result
                try{
                    result = await janusHttpTransportApi.get(this.host, path, this.secret)
                }catch(_){
                    console.log(_)
                    console.log('Err polling janus streaming ['+err+"/2]")
                    err ++
                    await delay(2000)
                    continue
                }
                if(!result || !result.janus === "success") {
                    console.log('Err polling janus streaming ['+err+"/2]")
                    err ++
                    await delay(2000)
                    continue
                }
                err = 0
                this.crashed = 0
                if(result.plugindata) {
                    event.call(result.transaction, result)
                }
            }
        }
    }

    /* Public */

    async init() {
        let result = null
        try{
            result = await this.createSession()
            if(result) {
                this.handler = (await this.createHandler()).handler
            }
        }catch(_){
            console.log('Janus off #9')
        }
        this.runner()                               /* Consume events */
    }

    kill() {
        console.log('killed '+this.host)
        this.killed = true
    }

    destroy() {}

    async list() {
        const path = this.session+"/"+this.handler
        const result = await janusHttpTransportApi.post(this.host, path, {
            "janus" : "message",
            "body" : {
                "request" : "list"
            }
        }, this.secret)
        if(!result.janus === "success") {
            console.log('Err listing janus streaming')
            return false
        }
        return result.plugindata.data.list
    }

    async create(payload) {
        console.log(this.session+"/"+this.handler)
        const path = this.session+"/"+this.handler
        const result = await janusHttpTransportApi.post(this.host, path, {
            "janus" : "message",
            "body" : {
                "request": "create",
                "type": "rtp",
                "metadata": payload.metadata,
                "audio": payload.audio,
                "audiopt": payload.audiopt,
                "audiortpmap": payload.audiortpmap,
                "audioport": payload.audioport,
                "video": payload.video,
                "videopt": payload.videopt,
                "videortpmap": payload.videortpmap,
                "videoport": payload.videoport
            }
        }, this.secret)
        if(!result.janus === "success") {
            console.log('Err listing janus streaming')
            return false
        }
        console.log(result)
        return result.plugindata.data
    }

    async delete() {
        if(!this.session) {
            console.log('Janus is not initiated')
            return
        }else{
            if(!await this.destroySession()) return
        }
        return true
    }
}
