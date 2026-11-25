import { useState } from 'react';
import { useLanguage } from './Language.jsx';
import { Radio, Select } from './Controls.jsx';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import './appearance.css';

export const colorModes = [
  { id: 'system', name: '跟随系统', icon: Monitor },
  { id: 'light', name: '浅色', icon: Sun },
  { id: 'dark', name: '深色', icon: Moon },
];

const trendPalettes = [
  { id: 'transformative-teal', name: '变革青' },
  { id: 'cool-blue', name: '冷调蓝' },
  { id: 'pinterest-jade', name: '玉石绿' },
  { id: 'plum-noir', name: '黑梅紫' },
  { id: 'wasabi', name: '芥末绿' },
  { id: 'persimmon', name: '柿子橙' },
];

const classicPalettes = [
  { id: 'fern', name: '蕨绿' },
  { id: 'jade', name: '翡翠' },
  { id: 'mint', name: '薄荷' },
  { id: 'glacier', name: '冰川蓝' },
  { id: 'ocean', name: '海洋蓝' },
  { id: 'indigo', name: '靛蓝' },
  { id: 'iris', name: '鸢尾紫' },
  { id: 'plum', name: '梅紫' },
  { id: 'rose', name: '玫瑰' },
  { id: 'coral', name: '珊瑚橙' },
  { id: 'amber', name: '琥珀' },
  { id: 'slate', name: '石板灰' },
];

const paletteGroups = [
  { id: 'trends', name: '2026 趋势配色', items: trendPalettes },
  { id: 'classics', name: '经典配色', items: classicPalettes },
];

export const appearanceKeys = {
  mode: 'association-manager.theme',
  palette: 'association-manager.palette',
};

export function readAppearance() {
  const mode = localStorage.getItem(appearanceKeys.mode);
  const palette = localStorage.getItem(appearanceKeys.palette);
  return {
    mode: colorModes.some((option) => option.id === mode) ? mode : 'system',
    palette: paletteGroups.some((group) => group.items.some((option) => option.id === palette)) ? palette : 'fern',
  };
}

export function AppearanceSettings({ appearance, onChange }) {
  const { t, language, changeLanguage } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [languageError, setLanguageError] = useState(false);

  async function chooseLanguage(event) {
    setLanguageError(false);
    setSaving(true);
    try { await changeLanguage(event.target.value); }
    catch { setLanguageError(true); }
    finally { setSaving(false); }
  }
  return <div className="appearance-settings">
    <div className="language-setting">
      <label htmlFor="interface-language">{t("语言")}</label>
      <Select id="interface-language" value={language} onChange={chooseLanguage} disabled={saving}>
        <option value="en" lang="en">English</option>
        <option value="zh-CN" lang="zh-CN">简体中文</option>
      </Select>
      {languageError && <p className="inline-error" role="alert">{t("无法保存语言设置。")}</p>}
    </div>
    <fieldset className="appearance-section">
      <legend>{t("显示模式")}</legend>
      <div className="mode-options">
        {colorModes.map(({ id, name, icon: Icon }) => <label className="mode-option" key={id}>
          <Radio className="appearance-radio" name="appearance-mode" value={id}
            checked={appearance.mode === id} onChange={() => onChange({ ...appearance, mode: id })} />
          <span className="mode-content"><Icon size={17} />{t(name)}</span>
        </label>)}
      </div>
    </fieldset>
    {paletteGroups.map(({ id: groupId, name: groupName, items }) => <fieldset className="appearance-section" key={groupId}>
      <legend>{t(groupName)}</legend>
      <div className="palette-options" data-group={groupId}>
        {items.map(({ id, name }) => <label className="palette-option" key={id}>
          <Radio className="appearance-radio" name="appearance-palette" value={id}
            checked={appearance.palette === id} onChange={() => onChange({ ...appearance, palette: id })} />
          <span className="palette-content">
            <span className="palette-preview" data-palette={id} aria-hidden="true">
              <span className="preview-sidebar" />
              <span className="preview-panel"><i /><i /><span /></span>
            </span>
            <span className="palette-label">{t(name)}{appearance.palette === id && <Check size={14} aria-hidden="true" />}</span>
          </span>
        </label>)}
      </div>
    </fieldset>)}
  </div>;
}
