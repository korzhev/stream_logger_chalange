/**
 * Created by Владимир on 03.05.2015.
 */

var through = require('through');
var uuid = require('uuid');
var fs = require('fs');

function getHex(number) {
    var str = '' + number.toString(16).toUpperCase();
    while (str.length < 8) str = '0' + str;
    return str;
}

function getNumber(line) {
    return parseInt(line.replace(/.*] (\d+) ".*/, '$1,'));
}

module.exports = {

    split: require('split'),

    tr: through(function (buf) {
        var num = getNumber(buf.toString());
        var hex = '';
        if (num) hex = getHex(num) + ' ' + num + '\n';
        console.log(num)
        this.queue(hex);
    })

};