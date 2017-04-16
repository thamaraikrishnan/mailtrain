'use strict';

const express = require('express');
const passport = require('../lib/passport');
const router = new express.Router();
const _ = require('../lib/translate')._;
const reportTemplates = require('../lib/models/report-templates');
const reports = require('../lib/models/reports');
const campaigns = require('../lib/models/campaigns');
const tools = require('../lib/tools');
const util = require('util');
const htmlescape = require('escape-html');
const striptags = require('striptags');
const hbs = require('hbs');
const vm = require('vm');

router.all('/*', (req, res, next) => {
    if (!req.user) {
        req.flash('danger', _('Need to be logged in to access restricted content'));
        return res.redirect('/users/login?next=' + encodeURIComponent(req.originalUrl));
    }
    res.setSelectedMenu('reports');
    next();
});

router.get('/', (req, res) => {
    res.render('reports/reports', {
        title: _('Reports')
    });
});

router.post('/ajax', (req, res) => {
    reports.filter(req.body, (err, data, total, filteredTotal) => {
        if (err) {
            return res.json({
                error: err.message || err,
                data: []
            });
        }

        res.json({
            draw: req.body.draw,
            recordsTotal: total,
            recordsFiltered: filteredTotal,
            data: data.map((row, i) => [
                (Number(req.body.start) || 0) + 1 + i,
                htmlescape(row.name || ''),
                htmlescape(row.reportTemplateName || ''),
                htmlescape(striptags(row.description) || ''),
                '<span class="datestring" data-date="' + row.created.toISOString() + '" title="' + row.created.toISOString() + '">' + row.created.toISOString() + '</span>',
                '<a href="/reports/view/' + row.id + '"><span class="glyphicon glyphicon-search" aria-hidden="true"></span></a> ' +
                '<a href="/reports/edit/' + row.id + '"><span class="glyphicon glyphicon-wrench" aria-hidden="true"></span></a>']
            )
        });
    });
});

router.get('/create', passport.csrfProtection, (req, res) => {
    const reqData = tools.convertKeys(req.query, {
        skip: ['layout']
    });

    reqData.csrfToken = req.csrfToken();
    reqData.title = _('Create Report');
    reqData.useEditor = true;

    reportTemplates.quicklist((err, items) => {
        if (err) {
            req.flash('danger', err.message || err);
            return res.redirect('/reports');
        }

        const reportTemplateId = Number(reqData.reportTemplate);

        if (reportTemplateId) {
            items.forEach(item => {
                if (item.id === reportTemplateId) {
                    item.selected = true;
                }
            });
        }

        reqData.reportTemplates = items;

        if (!reportTemplateId) {
            res.render('reports/create-select-template', reqData);
        } else {
            addUserFields(reportTemplateId, reqData, null, (err, data) => {
                if (err) {
                    req.flash('danger', err.message || err);
                    return res.redirect('/reports');
                }

                res.render('reports/create', data);
            });
        }
    });
});

router.post('/create', passport.parseForm, passport.csrfProtection, (req, res) => {
    const reqData = req.body;
    const reportTemplateId = Number(reqData.reportTemplate);

    addParamsObject(reportTemplateId, reqData, (err, data) => {
        if (err) {
            req.flash('danger', err && err.message || err || _('Could not create report'));
            return res.redirect('/reports/create?' + tools.queryParams(data));
        }

        reports.createOrUpdate(true, data, (err, id) => {
            if (err || !id) {
                req.flash('danger', err && err.message || err || _('Could not create report'));
                return res.redirect('/reports/create?' + tools.queryParams(data));
            }
            req.flash('success', util.format(_('Report “%s” created'), data.name));
            res.redirect('/reports');
        });
    });
});

router.get('/edit/:id', passport.csrfProtection, (req, res) => {
    const reqData = tools.convertKeys(req.query, {
        skip: ['layout']
    });

    reports.get(req.params.id, (err, template) => {
        if (err || !template) {
            req.flash('danger', err && err.message || err || _('Could not find report with specified ID'));
            return res.redirect('/reports');
        }

        template.csrfToken = req.csrfToken();
        template.title = _('Edit Report');
        template.useEditor = true;

        reportTemplates.quicklist((err, items) => {
            if (err) {
                req.flash('danger', err.message || err);
                return res.redirect('/');
            }

            const reportTemplateId = template.reportTemplate;

            items.forEach(item => {
                if (item.id === reportTemplateId) {
                    item.selected = true;
                }
            });

            template.reportTemplates = items;

            addUserFields(reportTemplateId, reqData, template, (err, data) => {
                if (err) {
                    req.flash('danger', err.message || err);
                    return res.redirect('/reports');
                }

                res.render('reports/edit', data);
            });
        });
    });
});

router.post('/edit', passport.parseForm, passport.csrfProtection, (req, res) => {
    const reqData = req.body;
    const reportTemplateId = Number(reqData.reportTemplate);

    addParamsObject(reportTemplateId, reqData, (err, data) => {
        if (err) {
            req.flash('danger', err && err.message || err || _('Could not update report'));
            return res.redirect('/reports/create?' + tools.queryParams(data));
        }

        reports.createOrUpdate(false, data, (err, updated) => {
            if (err) {
                req.flash('danger', err && err.message || err || _('Could not update report'));
                return res.redirect('/reports/edit/' + data.id + '?' + tools.queryParams(data));
            } else if (updated) {
                req.flash('success', _('Report updated'));
            } else {
                req.flash('info', _('Report not updated'));
            }

            return res.redirect('/reports');
        });
    });
});

router.post('/delete', passport.parseForm, passport.csrfProtection, (req, res) => {
    reports.delete(req.body.id, (err, deleted) => {
        if (err) {
            req.flash('danger', err && err.message || err);
        } else if (deleted) {
            req.flash('success', _('Report deleted'));
        } else {
            req.flash('info', _('Could not delete specified report'));
        }

        return res.redirect('/reports');
    });
});

router.get('/view/:id', passport.csrfProtection, (req, res) => {
    reports.get(req.params.id, (err, template) => {
        if (err || !template) {
            req.flash('danger', err && err.message || err || _('Could not find report with specified ID'));
            return res.redirect('/reports');
        }

        reportTemplates.get(template.reportTemplate, (err, reportTemplate) => {
            if (err) {
                return callback(err);
            }

            resolveUserFields(reportTemplate.userFieldsObject, template.paramsObject, (err, inputs) => {
                if (err) {
                    req.flash('danger', err.message || err);
                    return res.redirect('/reports');
                }

                const sandbox = {
                    require: require,
                    inputs: inputs,
                    callback: (err, outputs) => {
                        if (err) {
                            req.flash('danger', err.message || err);
                            return res.redirect('/reports');
                        }

                        const hbsTmpl = hbs.handlebars.compile(reportTemplate.hbs);
                        const report = hbsTmpl(outputs);

                        const data = {
                            csrfToken: req.csrfToken(),
                            report: new hbs.handlebars.SafeString(report),
                            title: outputs.title
                        };

                        res.render('reports/view', data);
                    }
                };

                try {
                    const script = new vm.Script(reportTemplate.js);
                    script.runInNewContext(sandbox, { displayErrors: true, timeout: 10000 });
                } catch (err) {
                    req.flash('danger', 'Error in the report template script ... ' + err.stack.replace(/at ContextifyScript.Script.runInContext[\s\S]*/,''));
                    return res.redirect('/reports');
                }
            });
        });
    });
});

function resolveCampaigns(ids, callback) {
    const idsRemaining = ids.slice();
    const resolved = [];

    function doWork() {
        if (idsRemaining.length == 0) {
            return callback(null, resolved);
        }

        campaigns.get(idsRemaining.shift(), false, (err, campaign) => {
            if (err) {
                return callback(err);
            }

            resolved.push(campaign);
            return doWork();
        });
    }

    setImmediate(doWork);
}

function resolveUserFields(userFields, params, callback) {
    const userFieldsRemaining = userFields.slice();
    const resolved = {};

    function doWork() {
        if (userFieldsRemaining.length == 0) {
            return callback(null, resolved);
        }

        const spec = userFieldsRemaining.shift();
        if (spec.type == 'campaign') {
            return resolveCampaigns(params[spec.id], (err, campaigns) => {
                if (spec.minOccurences == 1 && spec.maxOccurences == 1) {
                    resolved[spec.id] = campaigns[0];
                } else {
                    resolved[spec.id] = campaigns;
                }

                doWork();
            });
        }

        return callback(new Error(_('Unknown user field type "' + spec.type + '".')));
    }

    setImmediate(doWork);
}

function addUserFields(reportTemplateId, reqData, template, callback) {
    reportTemplates.get(reportTemplateId, (err, reportTemplate) => {
        if (err) {
            return callback(err);
        }

        const userFields = [];

        for (const spec of reportTemplate.userFieldsObject) {
            let value = '';
            if ((spec.id + 'Selection') in reqData) {
                value = reqData[spec.id + 'Selection'];
            } else if (template && template.paramsObject && spec.id in template.paramsObject) {
                value = template.paramsObject[spec.id].join(',');
            }

            userFields.push({
                'id': spec.id,
                'name': spec.name,
                'type': spec.type,
                'value': value,
                'isMulti': !(spec.minOccurences == 1 && spec.maxOccurences == 1)
            });
        }

        const data = template ? template : reqData;
        data.userFields = userFields;

        callback(null, data);
    });
}

function addParamsObject(reportTemplateId, data, callback) {
    reportTemplates.get(reportTemplateId, (err, reportTemplate) => {
        if (err) {
            return callback(err);
        }

        const paramsObject = {};

        for (const spec of reportTemplate.userFieldsObject) {
            const sel = data[spec.id + 'Selection'];

            if (!sel) {
                paramsObject[spec.id] = [];
            } else {
                paramsObject[spec.id] = sel.split(',').map(item => Number(item));
            }
        }

        data.paramsObject = paramsObject;

        callback(null, data);
    });
}

module.exports = router;
