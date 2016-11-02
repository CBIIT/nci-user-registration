var express = require('express');
var logoffRouter = express.Router();

var router = function (logger) {

    logoffRouter.route('/')
        .get(function (req, res) {
            req.session.destroy(function (err) {
                if (err) {
                    logger.error('Failed to destroy session: ' + err);
                }
            });

            // res.cookie('NIHSMSESSION', 'LOGGEDOFF', {
            //     domain: '.nih.gov',
            //     path: '/',
            //     httpOnly: true,
            //     secure: true
            // });
            res.clearCookie('NIHSMSESSION', { domain: '.nih.gov', path: '/' });
            res.clearCookie('REGSESSION', { domain: '.nih.gov', path: '/' });

            var message = 'Thanks and Goodbye.';
            var bg_class = 'bg-success';
            if (req.query.notfound) {
                message = 'User name and email combination not found. Please try again.' +
                    '<p>If you need assistance please contact the NIH IT Service Desk using the information in the side bar and state that you are trying to complete the NCI Federated User Registration process so that your request is routed to the appropriate technical support team.</p>';
                bg_class = 'bg-danger';
            } else if (req.query.mapped) {
                message = 'Your account was registered successfully. It will take up to 3 hours to transfer all your information.';
            } else if (req.query.previouslymapped) {
                message = '<p>Our records show that you are already registered and do not need to complete this process again. No further information is required from you at this time.</p>' +
                    '<p>If you have questions please contact the NIH IT Service Desk using the information in the side bar and state that you are trying to complete the NCI Federated User Registration process so that your request is routed to the appropriate technical support team.</p>';
            } else if (req.query.mailsent) {
                message = 'An email was sent to ' + req.query.mail +
                    '. Please check your email and follow the instructions to register your account.';
            } else if (req.query.exp) {
                message = 'The confirmation URL has expired. Please go back to the main page and submit your information to receive a new confirmation link.';
                bg_class = 'bg-warning';
            } else if (req.query.invalid) {
                message = 'The confirmation URL is invalid. Please go back to the main page and submit your information to receive a new confirmation link.';
                bg_class = 'bg-warning';
            } else if (req.query.mappingerror) {
                message = 'Account registration was unsuccessful.' +
                    '<p>If you need assistance please contact the NIH IT Service Desk using the information in the side bar and state that you are trying to complete the NCI Federated User Registration process so that your request is routed to the appropriate technical support team.</p>';
                bg_class = 'bg-danger';
            } else if (req.query.updateerror) {
                message = 'Public key update was unsuccessful.' +
                    '<p>If you need assistance please contact the NIH IT Service Desk using the information in the side bar and state that you are trying to complete the NCI Federated User Registration process so that your request is routed to the appropriate technical support team.</p>';
                bg_class = 'bg-danger';
            } else if (req.query.updatesuccess) {
                message = 'Public key update was successful.';
            } else if (req.query.prevregistration) {
                message = 'Your account has already been registered. No further action is required.';
            } else if (req.query.error) {
                message = 'An error occurred while registering your account. Please try again later.';
                bg_class = 'bg_danger';
            }
            res.render('logout', {
                message: message,
                bg_class: bg_class
            });
        });

    return logoffRouter;

};


module.exports = router;