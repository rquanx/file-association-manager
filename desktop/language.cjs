const fs = require('node:fs');
const path = require('node:path');
const messages = require('./messages.json');

const defaultLanguage = 'en';
const isLanguage = (value) => value === 'en' || value === 'zh-CN';

function translate(language, message, values) {
  const template = language === 'en' && Object.hasOwn(messages, message) ? messages[message] : message;
  return values ? template.replace(/\{(\w+)\}/g, (placeholder, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder) : template;
}

function languagePreference(directory) {
  const file = path.join(directory, 'language.json');
  let language = defaultLanguage;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (isLanguage(saved)) language = saved;
  } catch {
    // New profiles and unreadable preferences start in English.
  }
  return {
    get: () => language,
    set(value) {
      if (!isLanguage(value)) throw new Error('Unsupported language.');
      fs.mkdirSync(directory, { recursive: true });
      const tempFile = file + '.tmp';
      fs.writeFileSync(tempFile, JSON.stringify(value), 'utf8');
      fs.renameSync(tempFile, file);
      language = value;
      return language;
    },
  };
}

module.exports = { translate, languagePreference };
