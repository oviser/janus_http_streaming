const Instance = require("..")

; (async() => {
    const janus = new Instance({
        host: "95.217.162.126:8088",
        secret: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
    })
    await janus.init()
    const result = await janus.watch(1) //return JSEP offer

    console.log(result)
})()
