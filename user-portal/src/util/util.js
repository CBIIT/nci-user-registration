
var dateFormat = require('dateformat');

module.exports = {
    ts: function ( ) {
        var now = new Date();
        return 'TS(UTC):' + now.getTime() + ' ### ' + dateFormat(now, 'isoDateTime') + ' ### '; 
    }  
};