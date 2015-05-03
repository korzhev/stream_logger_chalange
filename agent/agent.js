/**
 * Created by Владимир on 01.05.2015.
 */
var net = require('net');
var config = require('.config');


var client = net.connect({port: config.port, host: config.host},
    function() { //'connect' listener
        console.log('connected to server!');
        client.write('world!\r\n');
    });
client.on('data', function(data) {
    console.log(data.toString());
    client.end();
});
client.on('end', function() {
    console.log('disconnected from server');
});


