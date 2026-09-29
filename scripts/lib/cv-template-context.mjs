import { AsyncLocalStorage } from 'node:async_hooks';

const templates = new AsyncLocalStorage();
export const currentCvTemplate = () => templates.getStore() || null;
export const currentCvTemplateId = () => currentCvTemplate()?.id || 'default';
export const withCvTemplate = (template, fn) => templates.run(template, fn);
