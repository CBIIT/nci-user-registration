module.exports = {
    ts: function ( ) {
        var now = new Date();
        return 'TS(UTC):' + now.getTime() + ' ### ' + now.toLocaleString() + ' ### '; 
    }  
};