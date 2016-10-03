var express = require( 'express' );
var protectedRouter = express.Router();

var router = function ( logger, db ) {

    protectedRouter.route( '/map/:id' )

    .get( function ( req, res ) {
        logger.info( 'authenticated by iTrust' );

        var sm_userdn = 'CN=test,OU=Users';
        var sm_universalid = 'test@test.com';
        var sm_samaccountname = 'test';
        var itrustInfo = {};
        itrustInfo.sm_userdn = sm_userdn;
        itrustInfo.sm_universalid = sm_universalid;
        itrustInfo.sm_samaccountname = sm_samaccountname;

        var id = req.params.id;

        db.addMapping( id, itrustInfo, function ( err ) {
            if ( err ) {
                logger.error( 'Failed to map uuid ' + id + ' to samaccountname ' + sm_samaccountname );
                res.redirect( '/auth/logout?mappingerror=true' );
            }
            logger.info( 'mapped uuid ' + id + ' to samaccountname ' + sm_samaccountname );
            res.redirect( '/auth/logout?mapped=true' );
        } );
    } );

    protectedRouter.route( '/update' )

    .get( function ( req, res ) {
        res.render( 'updateForm' );
    } );


    return protectedRouter;
};

module.exports = router;