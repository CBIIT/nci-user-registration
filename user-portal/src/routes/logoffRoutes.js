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

            res.clearCookie('NIHSMSESSION', {
                domain: '.nih.gov',
                path: '/'
            });
            res.clearCookie('REGSESSION', {
                domain: '.nih.gov',
                path: '/'
            });

            var message = 'Thanks and Goodbye.';
            var bg_class = 'bg-success';
            if (req.query.notfound) {
                message = 'User name and email combination not found. Please try again.' +
                    '<p>If you need assistance please contact the NIH IT Service Desk using the information in the side bar and state that you are trying to complete the NCI Federated User Registration process so that your request is routed to the appropriate technical support team.</p>';
                bg_class = 'bg-danger';
            } else if (req.query.mapped) {
                message = 'Your account was registered successfully. It will take up to one business day to transfer all your information.';
            } else if (req.query.previouslymapped) {
                message = '<p>Our records show that you are already registered and do not need to complete this process again. No further information is required from you at this time.</p>' +
                    '<p>If you have questions please contact the NIH IT Service Desk using the information in the side bar and state that you are trying to complete the NCI Federated User Registration process so that your request is routed to the appropriate technical support team.</p>';
            } else if (req.query.mailsent) {
                message = 'An email was sent to ' + req.query.mail +
                    '. Please check your email and follow the instructions to register your account.';
            } else if (req.query.exp) {
                message = 'The confirmation URL has expired. Please go back to the main page and submit your information to receive a new confirmation link.';
                bg_class = 'bg-warning';
            } else if (req.query.sessionexp) {
                message = 'Your session has expired and your account could not be registered. Please go back to the main page and resubmit your information to receive a new confirmation link and complete the registration.';
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
            } else if (req.query.updateerrorinc) {
                message = 'Public key update was unsuccessful.' +
                '<p>Your account is still in the registration stage and can not be updated at this time. Please try again in 24 hours. If you still have no success at this time please contact the NIH IT Service Desk using the information in the side bar and state that you are trying to update your NCI federated user account so that your request is routed to the appropriate technical support team. </p>';
                bg_class = 'bg-danger';
            } else if (req.query.updateerrornf) {
                message = 'Public key update was unsuccessful. Please make sure that your account has been registered.' +
                    '<p>If you need assistance please contact the NIH IT Service Desk using the information in the side bar and state that you are trying to complete the NCI Federated User Registration process so that your request is routed to the appropriate technical support team.</p>';
                bg_class = 'bg-danger';
            } else if (req.query.updatesuccess) {
                message = 'Public key update was successful.';
            } else if (req.query.prevregistration) {
                message = 'Your account has already been registered. No further action is required.';
            } else if (req.query.pending) {
                message = 'Your federated account has been provisioned but is not yet available for registration with NCI. This process can take up to one business day to complete. We will process the registration and send you an email notification once you can access the system.';
                bg_class = 'bg-success';
            } else if (req.query.invaliddn) {
                message = 'Your NCI registration request could not be processed automatically. We will process it manually and let you know when the registration has been completed.';
                bg_class = 'bg-danger';
            } else if (req.query.requestconfirmation) {
                message = 'Your request has been recorded. You will be contacted once the request has been fulfilled.';
            } else if (req.query.error) {
                message = 'An error occurred while registering your account. Please try again later.';
                bg_class = 'bg-danger';
            }
            res.render('logout', {
                message: message,
                bg_class: bg_class
            });
        });

    logoffRouter.route('/reattempt')
        .get(function (req, res) {
            res.clearCookie('NIHSMSESSION', {
                domain: '.nih.gov',
                path: '/'
            });
            var message;
            var bg_class = 'bg-success';
            var uuid = req.query.uuid;
            if (req.query.notfederated) {
                message = '<p>The NIH account you selected for registration is not a federated account. Please select a federated account (not HHS Staff) to complete registration.</p>' +
                    '<p>If you have questions please contact the NIH IT Service Desk using the information in the side bar and state that you are trying to complete the NCI Federated User Registration process so that your request is routed to the appropriate technical support team.</p>';
                bg_class = 'bg-warning';
               
            } else if (req.query.duplicateregistration) {
                message = '<p>Our records show that your NIH account was already registered and mapped to a different NCI account. If you want to use this NCI account you will need to register and select a different NIH account. </p>' +
                    '<p>If you have questions please contact the NIH IT Service Desk using the information in the side bar and state that you are trying to complete the NCI Federated User Registration process so that your request is routed to the appropriate technical support team.</p>';
                bg_class = 'bg-warning';
            }

            res.render('reattempt', {
                message: message,
                bg_class: bg_class,
                uuid: uuid
            });
        });

    return logoffRouter;

};


module.exports = router;