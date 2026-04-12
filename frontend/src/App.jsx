import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import './App.css';
// css boxicons 
import 'boxicons/css/boxicons.min.css';
// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE = 'http://127.0.0.1:3456/api';
const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];
const CAT_COLORS = [
  '#22d3ee','#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444'
];
const PAYMENT_METHODS = ['Dinheiro','Cartão de Crédito','Cartão de Débito','Pix','Transferência','Boleto','Outro'];

// ─── API Helper ───────────────────────────────────────────────────────────────
const api = {
  async request(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, opts);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Erro desconhecido');
    return data.data;
  },
  get: (path) => api.request('GET', path),
  post: (path, body) => api.request('POST', path, body),
  put: (path, body) => api.request('PUT', path, body),
  patch: (path, body) => api.request('PATCH', path, body),
  delete: (path) => api.request('DELETE', path),
};

// ─── Toast Context ────────────────────────────────────────────────────────────
const ToastContext = createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timerRef = useRef({});

  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    timerRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete timerRef.current[id];
    }, 3500);
  }, []);

  const icons = { success: '✓', error: '✕', info: 'ℹ' };

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="toast-icon">{icons[t.type]}</span>
            <span className="toast-msg">{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const useToast = () => useContext(ToastContext);

// ─── Theme Context ─────────────────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(() => {
    return localStorage.getItem('ff-theme') === 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('ff-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return [dark, () => setDark(d => !d)];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function formatDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(dateStr + 'T00:00:00');
  return Math.round((due - today) / 86400000);
}

// ─── Custom Bar Chart ──────────────────────────────────────────────────────────
function DistributionChart({ categories, transactions }) {
  const paid = transactions.filter(t => t.paid);
  const total = paid.reduce((s, t) => s + t.amount, 0);

  const byCategory = {};
  for (const cat of categories) byCategory[cat.id] = 0;
  for (const tx of paid) {
    if (tx.category_id && byCategory[tx.category_id] !== undefined) {
      byCategory[tx.category_id] += tx.amount;
    }
  }

  if (!categories.length) {
    return <div className="empty-state"><div className="empty-icon">📊</div><div className="empty-text">Nenhuma categoria configurada</div></div>;
  }

  return (
    <div className="bar-chart-container">
      {categories.map((cat, i) => {
        const spent = byCategory[cat.id] || 0;
        const pct = total > 0 ? (spent / total) * 100 : 0;
        return (
          <div key={cat.id} className="bar-chart-item">
            <div className="bar-chart-header">
              <div className="flex gap-2" style={{ alignItems: 'center' }}>
                <span className="cat-dot" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                <span className="bar-chart-label">{cat.name}</span>
              </div>
              <span className="bar-chart-value">{formatCurrency(spent)} · {pct.toFixed(1)}%</span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: `${Math.min(pct, 100)}%`,
                  background: `linear-gradient(90deg, ${CAT_COLORS[i % CAT_COLORS.length]}cc, ${CAT_COLORS[i % CAT_COLORS.length]})`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Comparison Chart ──────────────────────────────────────────────────────────
function ComparisonChart({ summary }) {
  if (!summary || !summary.categoryBreakdown?.length) {
    return <div className="empty-state"><div className="empty-icon">📈</div><div className="empty-text">Sem dados para comparar</div></div>;
  }

  const { categoryBreakdown } = summary;
  const maxVal = Math.max(...categoryBreakdown.flatMap(c => [c.planned_amount, c.spent_amount]), 1);

  return (
    <div className="comparison-chart">
      <div className="comp-legend">
        <div className="legend-item"><div className="legend-dot comp-bar-planned" /><span>Planejado</span></div>
        <div className="legend-item"><div className="legend-dot comp-bar-spent" /><span>Realizado</span></div>
      </div>
      {categoryBreakdown.map((cat, i) => {
        const planW = (cat.planned_amount / maxVal) * 100;
        const spentW = (cat.spent_amount / maxVal) * 100;
        const over = cat.spent_amount > cat.planned_amount;
        return (
          <div key={cat.id} className="comparison-item">
            <div className="comparison-label">{cat.name}</div>
            <div className="comparison-bars">
              <div className="comp-bar-row">
                <div className="comp-bar-track">
                  <div className="comp-bar-fill comp-bar-planned" style={{ width: `${planW}%` }} />
                </div>
                <span className="comp-bar-label">{formatCurrency(cat.planned_amount)}</span>
              </div>
              <div className="comp-bar-row">
                <div className="comp-bar-track">
                  <div
                    className={`comp-bar-fill ${over ? 'comp-bar-over' : 'comp-bar-spent'}`}
                    style={{ width: `${Math.min(spentW, 100)}%` }}
                  />
                </div>
                <span className="comp-bar-label" style={{ color: over ? 'var(--danger)' : undefined }}>
                  {formatCurrency(cat.spent_amount)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Category Editor ───────────────────────────────────────────────────────────
function CategoryEditor({ monthId, initialCategories, onSaved }) {
  const [cats, setCats] = useState(
    initialCategories.length > 0
      ? initialCategories.map(c => ({ ...c }))
      : []
  );
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const totalPct = cats.reduce((s, c) => s + (parseFloat(c.percentage) || 0), 0);

  function addCat() {
    if (cats.length >= 6) { toast('Máximo de 6 categorias', 'error'); return; }
    setCats(prev => [...prev, { name: '', percentage: 0 }]);
  }

  function removeCat(i) { setCats(prev => prev.filter((_, idx) => idx !== i)); }

  function updateCat(i, field, val) {
    setCats(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  }

  async function save() {
    if (totalPct > 100.01) { toast('Total de porcentagens excede 100%', 'error'); return; }
    setSaving(true);
    try {
      const res = await api.put(`/categories/month/${monthId}`, { categories: cats });
      onSaved(res.categories);
      toast('Categorias salvas com sucesso!', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally { setSaving(false); }
  }

  return (
    <div className="category-editor">
      {cats.map((cat, i) => (
        <div key={i} className="category-row">
          <input
            placeholder={`Categoria ${i + 1}`}
            value={cat.name}
            onChange={e => updateCat(i, 'name', e.target.value)}
          />
          <div style={{ position: 'relative' }}>
            <input
              type="number" min="0" max="100" step="0.5"
              value={cat.percentage}
              onChange={e => updateCat(i, 'percentage', parseFloat(e.target.value) || 0)}
              style={{ paddingRight: '24px' }}
            />
            <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>%</span>
          </div>
          <button className="btn btn-danger btn-icon btn-sm" onClick={() => removeCat(i)}>✕</button>
        </div>
      ))}
      {cats.length < 6 && (
        <button className="add-category-btn" onClick={addCat}>
          <span>＋</span> Adicionar categoria
        </button>
      )}
      <div className={`pct-total ${totalPct > 100 ? 'over' : ''}`}>
        Total: {totalPct.toFixed(1)}% {totalPct > 100 ? '⚠ Excede 100%' : totalPct < 100 ? `(${(100 - totalPct).toFixed(1)}% livre)` : '✓'}
      </div>
      <button className="btn btn-primary w-full" onClick={save} disabled={saving}>
        {saving ? 'Salvando...' : 'Salvar Categorias'}
      </button>
    </div>
  );
}

// ─── Transaction Modal ─────────────────────────────────────────────────────────
function TransactionModal({ year, month, categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    description: '', amount: '', payment_method: 'Pix',
    payment_type: 'avista', category_id: '', due_date: '',
    paid: false, installments: 2,
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.description.trim()) { toast('Informe a descrição', 'error'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast('Informe um valor válido', 'error'); return; }
    setSaving(true);
    try {
      await api.post('/transactions', {
        year, month,
        description: form.description.trim(),
        amount: parseFloat(form.amount),
        payment_method: form.payment_method,
        payment_type: form.payment_type,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        due_date: form.due_date,
        paid: form.paid,
        installments: form.payment_type === 'parcelado' ? form.installments : 1,
      });
      toast(
        form.payment_type === 'parcelado'
          ? `${form.installments} parcelas criadas!`
          : 'Despesa registrada!',
        'success'
      );
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
    } finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">📋 Nova Despesa</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group full">
              <label>Descrição *</label>
              <input placeholder="Ex: Aluguel, Supermercado..." value={form.description} onChange={e => setField('description', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Valor (R$) *</label>
              <input type="number" min="0" step="0.01" placeholder="0,00" value={form.amount} onChange={e => setField('amount', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Forma de Pagamento</label>
              <select value={form.payment_method} onChange={e => setField('payment_method', e.target.value)}>
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Tipo</label>
              <select value={form.payment_type} onChange={e => setField('payment_type', e.target.value)}>
                <option value="avista">À Vista</option>
                <option value="parcelado">Parcelado</option>
              </select>
            </div>
            {form.payment_type === 'parcelado' && (
              <div className="form-group">
                <label>Nº de Parcelas</label>
                <input type="number" min="2" max="60" value={form.installments} onChange={e => setField('installments', parseInt(e.target.value) || 2)} />
              </div>
            )}
            <div className="form-group">
              <label>Categoria</label>
              <select value={form.category_id} onChange={e => setField('category_id', e.target.value)}>
                <option value="">Sem categoria</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Data de Vencimento</label>
              <input type="date" value={form.due_date} onChange={e => setField('due_date', e.target.value)} />
            </div>
            <div className="form-group full">
              <div className="checkbox-row">
                <input type="checkbox" id="paid-cb" checked={form.paid} onChange={e => setField('paid', e.target.checked)} />
                <label htmlFor="paid-cb">Marcar como pago</label>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Salvando...' : form.payment_type === 'parcelado' ? `Criar ${form.installments} parcelas` : 'Salvar Despesa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Income Modal ──────────────────────────────────────────────────────────────
function IncomeModal({ year, month, onClose, onSaved }) {
  const [form, setForm] = useState({ description: '', amount: '', received: false });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.description.trim()) { toast('Informe a descrição', 'error'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast('Informe um valor válido', 'error'); return; }
    setSaving(true);
    try {
      await api.post('/incomes', {
        year, month,
        description: form.description.trim(),
        amount: parseFloat(form.amount),
        received: form.received,
      });
      toast('Entrada registrada!', 'success');
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
    } finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">💰 Nova Entrada</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group full">
              <label>Descrição *</label>
              <input placeholder="Ex: Salário, Freelance..." value={form.description} onChange={e => setField('description', e.target.value)} />
            </div>
            <div className="form-group full">
              <label>Valor (R$) *</label>
              <input type="number" min="0" step="0.01" placeholder="0,00" value={form.amount} onChange={e => setField('amount', e.target.value)} />
            </div>
            <div className="form-group full">
              <div className="checkbox-row">
                <input type="checkbox" id="recv-cb" checked={form.received} onChange={e => setField('received', e.target.checked)} />
                <label htmlFor="recv-cb">Marcar como recebido</label>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-success" onClick={submit} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar Entrada'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Category Modal (settings) ─────────────────────────────────────────────────
function CategoryModal({ monthId, categories, onClose, onSaved }) {
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">⚙️ Configurar Categorias</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="text-muted mb-4">
            Defina até 6 categorias e suas porcentagens do orçamento. A base de cálculo é a receita recebida do mês.
          </p>
          <CategoryEditor
            monthId={monthId}
            initialCategories={categories}
            onSaved={(updated) => { onSaved(updated); onClose(); }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Transactions Table ────────────────────────────────────────────────────────
function TransactionsTable({ transactions, categories, onTogglePaid, onDelete }) {
  const toast = useToast();

  async function togglePaid(tx) {
    try {
      await api.patch(`/transactions/${tx.id}`, { paid: !tx.paid });
      onTogglePaid();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function del(tx) {
    const isGroup = tx.is_installment && tx.total_installments > 1;
    let deleteAll = false;
    if (isGroup) {
      deleteAll = window.confirm(
        `Esta é uma parcela (${tx.installment_number}/${tx.total_installments}).\n\nOK = Deletar TODAS as parcelas\nCancelar = Deletar só esta`
      );
    }
    try {
      await api.delete(`/transactions/${tx.id}${deleteAll ? '?all=true' : ''}`);
      toast('Deletado', 'info');
      onDelete();
    } catch (err) { toast(err.message, 'error'); }
  }

  if (!transactions.length) {
    return <div className="empty-state"><div className="empty-icon">📄</div><div className="empty-text">Nenhuma despesa registrada</div></div>;
  }

  const catMap = {};
  categories.forEach((c, i) => { catMap[c.id] = { ...c, color: CAT_COLORS[i % CAT_COLORS.length] }; });

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pago</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Valor</th>
            <th>Vencimento</th>
            <th>Forma</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(tx => {
            const cat = catMap[tx.category_id];
            const days = daysUntil(tx.due_date);
            return (
              <tr key={tx.id}>
                <td>
                  <button
                    className={`paid-toggle ${tx.paid ? 'active' : ''}`}
                    onClick={() => togglePaid(tx)}
                    title={tx.paid ? 'Marcar como não pago' : 'Marcar como pago'}
                  />
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 500 }}>{tx.description}</span>
                    {tx.is_installment ? (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Parcela {tx.installment_number}/{tx.total_installments}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>
                  {cat ? (
                    <span className="flex gap-2" style={{ alignItems: 'center' }}>
                      <span className="cat-dot" style={{ background: cat.color }} />
                      {cat.name}
                    </span>
                  ) : <span className="text-muted">—</span>}
                </td>
                <td className="td-mono" style={{ fontWeight: 600 }}>{formatCurrency(tx.amount)}</td>
                <td>
                  {tx.due_date ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span>{formatDate(tx.due_date)}</span>
                      {!tx.paid && days !== null && (
                        <span style={{ fontSize: '0.68rem', color: days < 0 ? 'var(--danger)' : days <= 3 ? 'var(--warning)' : 'var(--text-muted)' }}>
                          {days < 0 ? `${Math.abs(days)}d atraso` : days === 0 ? 'Hoje' : `${days}d`}
                        </span>
                      )}
                    </div>
                  ) : <span className="text-muted">—</span>}
                </td>
                <td>
                  <span className="badge badge-muted">{tx.payment_method || '—'}</span>
                </td>
                <td>
                  <button className="btn btn-danger btn-icon btn-sm" onClick={() => del(tx)} title="Excluir">✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Incomes Table ─────────────────────────────────────────────────────────────
function IncomesTable({ incomes, onToggle, onDelete }) {
  const toast = useToast();

  async function toggle(inc) {
    try {
      await api.patch(`/incomes/${inc.id}`, { received: !inc.received });
      onToggle();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function del(inc) {
    try {
      await api.delete(`/incomes/${inc.id}`);
      toast('Deletado', 'info');
      onDelete();
    } catch (err) { toast(err.message, 'error'); }
  }

  if (!incomes.length) {
    return <div className="empty-state"><div className="empty-icon">💵</div><div className="empty-text">Nenhuma entrada registrada</div></div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Recebido</th>
            <th>Descrição</th>
            <th>Valor</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {incomes.map(inc => (
            <tr key={inc.id}>
              <td>
                <button
                  className={`paid-toggle ${inc.received ? 'active' : ''}`}
                  onClick={() => toggle(inc)}
                  title={inc.received ? 'Marcar como não recebido' : 'Marcar como recebido'}
                />
              </td>
              <td style={{ fontWeight: 500 }}>{inc.description}</td>
              <td className="td-mono" style={{ fontWeight: 600, color: 'var(--success)' }}>{formatCurrency(inc.amount)}</td>
              <td>
                <button className="btn btn-danger btn-icon btn-sm" onClick={() => del(inc)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Upcoming Bills ────────────────────────────────────────────────────────────
function UpcomingBills({ summary, onRefresh }) {
  const toast = useToast();
  const { upcoming = [], overdue = [] } = summary || {};

  async function markPaid(tx) {
    try {
      await api.patch(`/transactions/${tx.id}`, { paid: true });
      toast('Marcado como pago!', 'success');
      onRefresh();
    } catch (err) { toast(err.message, 'error'); }
  }

  const all = [...overdue.map(t => ({ ...t, _over: true })), ...upcoming];

  if (!all.length) {
    return <div className="empty-state"><div className="empty-icon">✅</div><div className="empty-text">Sem contas a vencer</div></div>;
  }

  return (
    <div className="bills-list">
      {all.map(tx => {
        const days = daysUntil(tx.due_date);
        return (
          <div key={tx.id} className={`bill-item ${tx._over ? 'overdue' : ''}`}>
            <div className="bill-info">
              <span className="bill-desc">{tx.description}</span>
              <span className="bill-meta">
                {tx.category_name ? `${tx.category_name} · ` : ''}
                Vence {formatDate(tx.due_date)}
                {days !== null && (
                  <span style={{ color: tx._over ? 'var(--danger)' : days <= 3 ? 'var(--warning)' : 'var(--text-muted)' }}>
                    {tx._over ? ` (${Math.abs(days)}d atraso)` : days === 0 ? ' (Hoje)' : ` (${days}d)`}
                  </span>
                )}
              </span>
            </div>
            <div className="bill-right">
              <span className="bill-amount">{formatCurrency(tx.amount)}</span>
              <button className="btn btn-success btn-sm" onClick={() => markPaid(tx)}>Pagar</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── KPI Strip ─────────────────────────────────────────────────────────────────
function KpiStrip({ summary }) {
  const { totalIncome = 0, totalExpenses = 0, balance = 0 } = summary || {};
  const isNeg = balance < 0;

  return (
    <div className="kpi-strip">
      <div className="kpi-card income">
        <div className="kpi-label">Receita Recebida</div>
        <div className="kpi-value">{formatCurrency(totalIncome)}</div>
        <div className="kpi-icon">💰</div>
      </div>
      <div className="kpi-card expense">
        <div className="kpi-label">Despesas Pagas</div>
        <div className="kpi-value">{formatCurrency(totalExpenses)}</div>
        <div className="kpi-icon">📤</div>
      </div>
      <div className={`kpi-card balance ${isNeg ? 'negative' : ''}`}>
        <div className="kpi-label">Saldo</div>
        <div className={`kpi-value ${isNeg ? 'negative' : 'positive'}`}>{formatCurrency(balance)}</div>
        <div className="kpi-icon">{isNeg ? '📉' : '📈'}</div>
      </div>
    </div>
  );
}

// ─── Month View ────────────────────────────────────────────────────────────────
function MonthView({ year, month, darkMode, toggleTheme }) {
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showTxModal, setShowTxModal] = useState(false);
  const [showIncModal, setShowIncModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [monthData, sumData] = await Promise.all([
        api.get(`/months/${year}/${month}`),
        api.get(`/summary/${year}/${month}`).catch(() => ({ summary: null })),
      ]);
      setData(monthData);
      setSummary(sumData.summary || sumData);
    } catch (err) {
      toast(err.message, 'error');
    } finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (!data) return null;

  const { categories = [], transactions = [], incomes = [] } = data;

  return (
    <>
      {/* Top Bar */}
      <div className="top-bar">
        <div className="page-title">
          {MONTH_NAMES[month - 1]}
          <span className="month-badge">{year}</span>
        </div>
        <div className="top-bar-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowCatModal(true)}>⚙️ Categorias</button>
          <button className="btn btn-success btn-sm" onClick={() => setShowIncModal(true)}>＋ Entrada</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowTxModal(true)}>＋ Despesa</button>
          <button className="theme-toggle" onClick={toggleTheme} style={{ width: 'auto', padding: '6px 12px', fontSize: '0.75rem' }}>
            {darkMode ? '☀️ Claro' : '🌙 Escuro'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="content-scroll">
        {/* Tabs */}
        <div className="tabs">
          {[['dashboard','📊 Dashboard'],['transactions','📋 Despesas'],['incomes','💰 Entradas']].map(([k, label]) => (
            <button key={k} className={`tab-btn ${activeTab === k ? 'active' : ''}`} onClick={() => setActiveTab(k)}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Dashboard Tab ── */}
        {activeTab === 'dashboard' && (
          <>
            <KpiStrip summary={summary} />

            <div className="dashboard-grid">
              {/* Distribution Chart */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">📊 Distribuição por Categoria</span>
                </div>
                <DistributionChart categories={categories} transactions={transactions} />
              </div>

              {/* Upcoming Bills */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">🔔 Contas a Vencer</span>
                </div>
                <UpcomingBills summary={summary} onRefresh={load} />
              </div>

              {/* Comparison Chart */}
              <div className="card full-width">
                <div className="card-header">
                  <span className="card-title">📈 Planejado vs Realizado</span>
                </div>
                <ComparisonChart summary={summary} />
              </div>
            </div>

            {/* Category overview table */}
            {categories.length > 0 && (
              <div className="card mb-6">
                <div className="card-header">
                  <span className="card-title">🗂 Orçamento por Categoria</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Categoria</th>
                        <th>% Planejada</th>
                        <th>Valor Planejado</th>
                        <th>Gasto Real</th>
                        <th>Diferença</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summary?.categoryBreakdown || []).map((cat, i) => {
                        const diff = cat.planned_amount - cat.spent_amount;
                        const over = diff < 0;
                        return (
                          <tr key={cat.id}>
                            <td>
                              <span className="flex gap-2" style={{ alignItems: 'center' }}>
                                <span className="cat-dot" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                                {cat.name}
                              </span>
                            </td>
                            <td className="td-mono">{cat.percentage.toFixed(1)}%</td>
                            <td className="td-mono">{formatCurrency(cat.planned_amount)}</td>
                            <td className="td-mono" style={{ fontWeight: 600 }}>{formatCurrency(cat.spent_amount)}</td>
                            <td className="td-mono" style={{ color: over ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                              {over ? '-' : '+'}{formatCurrency(Math.abs(diff))}
                            </td>
                            <td>
                              <span className={`badge ${over ? 'badge-danger' : 'badge-success'}`}>
                                {over ? 'Excedido' : 'OK'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Transactions Tab ── */}
        {activeTab === 'transactions' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">📋 Despesas do Mês</span>
              <button className="btn btn-primary btn-sm" onClick={() => setShowTxModal(true)}>＋ Nova</button>
            </div>
            <TransactionsTable
              transactions={transactions}
              categories={categories}
              onTogglePaid={load}
              onDelete={load}
            />
          </div>
        )}

        {/* ── Incomes Tab ── */}
        {activeTab === 'incomes' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">💰 Entradas do Mês</span>
              <button className="btn btn-success btn-sm" onClick={() => setShowIncModal(true)}>＋ Nova</button>
            </div>
            <IncomesTable incomes={incomes} onToggle={load} onDelete={load} />
          </div>
        )}
      </div>

      {/* Modals */}
      {showTxModal && (
        <TransactionModal
          year={year} month={month} categories={categories}
          onClose={() => setShowTxModal(false)}
          onSaved={() => { setShowTxModal(false); load(); }}
        />
      )}
      {showIncModal && (
        <IncomeModal
          year={year} month={month}
          onClose={() => setShowIncModal(false)}
          onSaved={() => { setShowIncModal(false); load(); }}
        />
      )}
      {showCatModal && (
        <CategoryModal
          monthId={data.month.id}
          categories={categories}
          onClose={() => setShowCatModal(false)}
          onSaved={(updated) => { setData(d => ({ ...d, categories: updated })); load(); }}
        />
      )}
    </>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ year, month, onSelectMonth, onYearChange }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">
          <div className="logo-icon">💹</div>
          <div>
            <div className="logo-text">FinanceFlow</div>
            <div className="logo-sub">Controle Financeiro</div>
          </div>
        </div>
      </div>

      <div className="sidebar-year-selector">
        <div className="year-control">
          <button className="year-btn" onClick={() => onYearChange(-1)}>‹</button>
          <span className="year-display">{year}</span>
          <button className="year-btn" onClick={() => onYearChange(1)}>›</button>
        </div>
      </div>

      <nav className="sidebar-months">
        {MONTH_NAMES.map((name, i) => (
          <button
            key={i}
            className={`month-btn ${month === i + 1 ? 'active' : ''}`}
            onClick={() => onSelectMonth(i + 1)}
          >
            <span className="month-number">{String(i + 1).padStart(2, '0')}</span>
            <span>{name}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

// ─── App Root ──────────────────────────────────────────────────────────────────
function AppContent() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [darkMode, toggleTheme] = useTheme();

  return (
    <div className="app-shell">
      <Sidebar
        year={year} month={month}
        onSelectMonth={setMonth}
        onYearChange={delta => setYear(y => y + delta)}
      />
      <main className="main-content">
        <MonthView
          key={`${year}-${month}`}
          year={year} month={month}
          darkMode={darkMode}
          toggleTheme={toggleTheme}
        />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
