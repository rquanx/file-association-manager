import { useLanguage } from './Language.jsx';
import { Button, Dialog, IconButton, SearchField, Select } from './Controls.jsx';
import { useEffect, useState } from 'react';
import { ArrowRight, History, RotateCcw } from 'lucide-react';
import { Pagination, usePage } from './Pagination.jsx';

const labels = { apply: '手动关联', restore: '导入恢复', rollback: '历史回退' };

export function HistoryDialog({ api, onClose, onChange, onSettings, describeError }) {
  const { t, language } = useLanguage();
  const formatter = new Intl.DateTimeFormat(language, { dateStyle: "short", timeStyle: "medium" });
  const appName = (app) => app?.name || t("未设置默认应用");
  const [entries, setEntries] = useState(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [extension, setExtension] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [windowsBlocked, setWindowsBlocked] = useState(false);

  useEffect(() => {
    let active = true;
    api.history().then(({ entries: rows, warning }) => { if (active) { setEntries(rows); setNotice(warning); } })
      .catch((failure) => { if (active) { setError(t(describeError(failure))); setEntries([]); } });
    return () => { active = false; };
  }, [api, describeError, t]);

  const needle = query.trim().toLowerCase();
  const extensions = [...new Set((entries || []).map((row) => row.extension))].sort();
  const filtered = (entries || []).filter((row) => (!kind || row.operation === kind) && (!extension || row.extension === extension) &&
    (!needle || [row.extension, appName(row.before), appName(row.after), t(labels[row.operation]), formatter.format(new Date(row.time))]
      .some((value) => value?.toLowerCase().includes(needle))));
  const page = usePage(filtered, pageIndex, 7);

  async function preview(id) {
    setError('');
    setNotice('');
    setWindowsBlocked(false);
    setBusy(true);
    try { setConfirmation(await api.previewRollback(id)); }
    catch (failure) { setError(t(describeError(failure))); }
    finally { setBusy(false); }
  }

  async function rollback() {
    setError('');
    setBusy(true);
    try {
      const result = await api.rollback(confirmation.id);
      if (result.status === 'stale') {
        setConfirmation({ ...confirmation, current: result.current });
        setError(t("默认应用刚刚发生变化，请核对当前应用后再次确认。"));
        return;
      }
      setConfirmation(null);
      setWindowsBlocked(result.reason === 'windows');
      if (result.status === 'failed') {
        const errors = {
          missing: t("原应用已不可用，无法回退到此版本。"),
          fallback: t("Windows 自动选择了默认应用，无法恢复到记录中的状态。"),
          windows: t("Windows 拒绝修改此扩展名，可打开系统设置处理。"),
        };
        setError(errors[result.reason] || t(result.message) || t("未能回退。"));
      } else {
        setNotice(result.historyWarning || (result.status === 'changed' ? t("已回退到所选记录的原应用。") : t("当前应用已经是回退目标。")));
      }
      if (result.time) {
        await onChange();
        const { entries: rows, warning } = await api.history();
        setEntries(rows);
        if (warning && !result.historyWarning) setNotice(warning);
      }
    } catch (failure) {
      setError(t(describeError(failure)));
    } finally {
      setBusy(false);
    }
  }

  return <Dialog className="history-dialog" title={confirmation ? t("确认回退") : t("关联历史")}
    onClose={confirmation ? () => { setConfirmation(null); setError(''); } : onClose} busy={busy}>
    {confirmation ? <>
      <p className="modal-description">{t('是否将 {extension} 从当前默认应用回退到所选记录里的原应用？', confirmation)}</p>
      <div className="rollback-direction">
        <span><small>{t("当前默认应用")}</small><strong>{appName(confirmation.current)}</strong></span>
        <ArrowRight size={19} aria-hidden="true" />
        <span><small>{t("回退目标")}</small><strong>{appName(confirmation.target)}</strong></span>
      </div>
    </> : <>
      <div className="history-controls">
        <SearchField aria-label={t("搜索关联历史")} placeholder={t("搜索扩展名、应用或时间")}
          value={query} onChange={(event) => { setQuery(event.target.value); setPageIndex(0); }} />
        <Select aria-label={t("按扩展名筛选")} value={extension}
          onChange={(event) => { setExtension(event.target.value); setPageIndex(0); }}>
          <option value="">{t("全部扩展名")}</option>
          {extensions.map((value) => <option key={value} value={value}>{value}</option>)}
        </Select>
        <Select aria-label={t("按操作筛选")} value={kind}
          onChange={(event) => { setKind(event.target.value); setPageIndex(0); }}>
          <option value="">{t("全部操作")}</option>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
        </Select>
      </div>
      {page.total ? <table className="history-table"><thead><tr>
        <th scope="col">{t("时间")}</th><th scope="col">{t("扩展名")}</th><th scope="col">{t("原应用")}</th>
        <th scope="col">{t("新应用")}</th><th scope="col">{t("操作")}</th>
      </tr></thead><tbody>{page.items.map((row) => <tr key={row.id}>
        <td><time dateTime={row.time} title={row.recovered ? t("操作开始时间。重启后核对 Windows 状态时补记。") : undefined}>{formatter.format(new Date(row.time))}</time>
          <small>{t(labels[row.operation])}{row.recovered ? ' · ' + t('中断后补记') : ''}</small></td>
        <td><code>{row.extension}</code></td><td title={appName(row.before)}>{appName(row.before)}</td>
        <td title={appName(row.after)}>{appName(row.after)}</td>
        <td><IconButton title={t("回退此条记录")} aria-label={t('回退 {extension}', row)} disabled={busy} onClick={() => preview(row.id)}><RotateCcw size={16} /></IconButton></td>
      </tr>)}</tbody></table> : <div className="history-empty"><History size={20} />
        {entries === null ? t("正在读取历史") : entries.length ? t("没有匹配的记录") : t("还没有关联记录")}</div>}
      {page.total > 7 && <Pagination page={page} onChange={setPageIndex} label={t("历史分页")} compact />}
    </>}
    {error && <p className="inline-error history-feedback" role="alert">{error}</p>}
    {notice && <p className="history-feedback" role="status">{notice}</p>}
    {windowsBlocked && <Button variant="secondary" onClick={onSettings}>{t("打开 Windows 设置")}</Button>}
    {confirmation && <div className="modal-actions"><div className="spacer" />
      <Button variant="secondary" disabled={busy} onClick={() => { setConfirmation(null); setError(''); }}>{t("取消")}</Button>
      <Button variant="primary" disabled={busy} onClick={rollback}>{busy ? t("正在回退") : t("确认回退")}</Button>
    </div>}
  </Dialog>;
}
