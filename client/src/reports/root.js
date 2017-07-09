'use strict';

import React from 'react';
import ReactDOM from 'react-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../lib/i18n';

import { Section } from '../lib/page'
import ReportsCUD from './CUD'
import ReportsList from './List'
import ReportTemplatesCUD from './templates/CUD'
import ReportTemplatesList from './templates/List'

const getStructure = t => {
    const subPaths = {};

    return {
        '': {
            title: t('Home'),
            externalLink: '/',
            children: {
                'reports': {
                    title: t('Reports'),
                    link: '/reports',
                    component: ReportsList,
                    children: {
                        edit: {
                            title: t('Edit Report'),
                            params: [':id', ':action?'],
                            render: props => (<ReportsCUD edit {...props} />)
                        },
                        create: {
                            title: t('Create Report'),
                            render: props => (<ReportsCUD {...props} />)
                        },
                        'templates': {
                            title: t('Templates'),
                            link: '/reports/templates',
                            component: ReportTemplatesList,
                            children: {
                                edit: {
                                    title: t('Edit Report Template'),
                                    params: [':id', ':action?'],
                                    render: props => (<ReportTemplatesCUD edit {...props} />)
                                },
                                create: {
                                    title: t('Create Report Template'),
                                    params: [':wizard?'],
                                    render: props => (<ReportTemplatesCUD {...props} />)
                                }
                            }
                        }
                    }
                },
            }
        }
    }
};

export default function() {
    ReactDOM.render(
        <I18nextProvider i18n={ i18n }><Section root='/reports' structure={getStructure}/></I18nextProvider>,
        document.getElementById('root')
    );
};


