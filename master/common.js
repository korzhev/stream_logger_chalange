/**
 * Created by Владимир on 03.05.2015.
 */

var through = require('through');
var uuid = require('uuid');
var fs = require('fs');
// считаем Hex
function getHex(number) {
    var str = '' + number.toString(16).toUpperCase();
    while (str.length < 8) str = '0' + str;
    return str;
}
// ищем число в строке лога
function getNumber(line) {
    return parseInt(line.replace(/.*] (\d+) ".*/, '$1,'));
}

module.exports = {

    split: require('split'), // модуль который разделяет поток на строки

    tr: through(function (buf) {
        var num = getNumber(buf.toString());
        var hex = '';
        if (num) hex = getHex(num)+'\n'; // получаем новую строку
        this.queue(hex); // предаём результат дальше
    })

};