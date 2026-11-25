import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import messages from '../desktop/messages.json';

const Language = createContext(null);

export function LanguageProvider({ children }) {
  const api = window.associationManager;
  const [language, setLanguage] = useState('en');
  const [ready, setReady] = useState(!api);
  useEffect(() => {
    let active = true;
    api?.language().then((saved) => {
      if (active && saved === 'zh-CN') setLanguage(saved);
    }).catch(() => {}).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [api]);

  const value = useMemo(() => ({
    language,
    async changeLanguage(next) {
      if (api) await api.setLanguage(next);
      setLanguage(next);
    },
    t(message, values) {
      const template = language === 'en' && Object.hasOwn(messages, message) ? messages[message] : message;
      return values ? template.replace(/\{(\w+)\}/g, (placeholder, key) =>
        Object.hasOwn(values, key) ? String(values[key]) : placeholder) : template;
    },
  }), [api, language]);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = value.t('文件关联管理器');
  }, [language, value]);

  return ready && <Language.Provider value={value}>{children}</Language.Provider>;
}

export function useLanguage() {
  return useContext(Language);
}
