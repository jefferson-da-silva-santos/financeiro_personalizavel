import {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
} from "react";
import "./App.css";
import "boxicons/css/boxicons.min.css";

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:3000/financeflow/api";
const AUTH_BASE = "http://localhost:3000/auth";
const STORAGE_TOKEN = "planware_token";
const STORAGE_USER = "planware_user";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const CAT_COLORS = [
  "#22d3ee",
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
];
const PAYMENT_METHODS = [
  "Dinheiro",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Pix",
  "Transferência",
  "Boleto",
  "Outro",
];

// ─── Auth Helper ──────────────────────────────────────────────────────────────
const auth = {
  getToken: () => localStorage.getItem(STORAGE_TOKEN),
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_USER));
    } catch {
      return null;
    }
  },
  save: (token, user) => {
    localStorage.setItem(STORAGE_TOKEN, token);
    localStorage.setItem(STORAGE_USER, JSON.stringify(user));
  },
  clear: () => {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
  },
  isLogged: () => !!localStorage.getItem(STORAGE_TOKEN),
};

// ─── API Helper ───────────────────────────────────────────────────────────────
const api = {
  async request(method, path, body = null, base = API_BASE) {
    const token = auth.getToken();
    const opts = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${base}${path}`, opts);

    // Token expirado ou inválido → desloga
    if (res.status === 401) {
      auth.clear();
      window.location.reload();
      return;
    }

    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Erro desconhecido");
    return data.data;
  },
  get: (path) => api.request("GET", path),
  post: (path, body) => api.request("POST", path, body),
  put: (path, body) => api.request("PUT", path, body),
  patch: (path, body) => api.request("PATCH", path, body),
  delete: (path) => api.request("DELETE", path),

  // Auth endpoints (sem prefixo financeflow)
  login: async (email, password) => {
    const res = await fetch(`${AUTH_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Credenciais inválidas");
    return data.data; // { accessToken, refreshToken, user }
  },
};

// ─── Auth Context ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => auth.getUser());
  const [logged, setLogged] = useState(() => auth.isLogged());

  function doLogin(token, userData) {
    auth.save(token, userData);
    setUser(userData);
    setLogged(true);
  }

  function doLogout() {
    auth.clear();
    setUser(null);
    setLogged(false);
  }

  return (
    <AuthContext.Provider value={{ user, logged, doLogin, doLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

const useAuth = () => useContext(AuthContext);

// ─── Toast Context ────────────────────────────────────────────────────────────
const ToastContext = createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timerRef = useRef({});

  const addToast = useCallback((msg, type = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg, type }]);
    timerRef.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete timerRef.current[id];
    }, 3500);
  }, []);

  const icons = { success: "✓", error: "✕", info: "ℹ" };

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
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

// ─── Theme ────────────────────────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(
    () => localStorage.getItem("ff-theme") === "dark",
  );
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      dark ? "dark" : "light",
    );
    localStorage.setItem("ff-theme", dark ? "dark" : "light");
  }, [dark]);
  return [dark, () => setDark((d) => !d)];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(v) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v || 0);
}

function formatDate(str) {
  if (!str) return "—";
  const [y, m, d] = str.split("-");
  return `${d}/${m}/${y}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  return Math.round((due - today) / 86400000);
}

// ─── Login Page ───────────────────────────────────────────────────────────────
function LoginPage() {
  const { doLogin } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, toggleTheme] = useTheme();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast("Preencha e-mail e senha", "error");
      return;
    }
    setLoading(true);
    try {
      const { accessToken, user } = await api.login(email.trim(), password);

      // Verifica se o usuário tem permissão para o sistema FINANCEFLOW
      const hasAccess =
        user.role === "SUPERADMIN" || user.permissions?.includes("FINANCEFLOW");
      if (!hasAccess) {
        toast("Você não tem acesso ao FinanceFlow", "error");
        return;
      }

      doLogin(accessToken, user);
      toast(`Bem-vindo, ${user.name}!`, "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="login-blob login-blob-1" />
        <div className="login-blob login-blob-2" />
      </div>

      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <div className="logo-icon">💹</div>
          <div>
            <div className="logo-text">FinanceFlow</div>
            <div className="logo-sub">Controle Financeiro Personalizável</div>
          </div>
        </div>

        <h2 className="login-title">Entrar na conta</h2>
        <p className="login-subtitle">Use suas credenciais Planware</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>E-mail</label>
            <div className="input-icon-wrap">
              <i className="bx bx-envelope input-icon" />
              <input
                type="email"
                className="input-with-icon"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Senha</label>
            <div className="input-icon-wrap">
              <i className="bx bx-lock-alt input-icon" />
              <input
                type={showPass ? "text" : "password"}
                className="input-with-icon input-with-icon-right"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="input-eye"
                onClick={() => setShowPass((s) => !s)}
                tabIndex={-1}
              >
                <i className={`bx ${showPass ? "bx-hide" : "bx-show"}`} />
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full login-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="spinner-sm" />
            ) : (
              <>
                <i className="bx bx-log-in" /> Entrar
              </>
            )}
          </button>
        </form>

        <button className="login-theme-btn" onClick={toggleTheme}>
          <i className="bx bx-moon" /> Alternar tema
        </button>
      </div>
    </div>
  );
}

// ─── Pie Chart ─────────────────────────────────────────────────────────────────
function PieChart({ categories, transactions }) {
  const paid = transactions.filter((t) => t.paid);
  const total = paid.reduce((s, t) => s + t.amount, 0);

  const byCategory = {};
  for (const cat of categories) byCategory[cat.id] = 0;
  let uncategorized = 0;
  for (const tx of paid) {
    if (tx.category_id && byCategory[tx.category_id] !== undefined) {
      byCategory[tx.category_id] += tx.amount;
    } else {
      uncategorized += tx.amount;
    }
  }

  if (!categories.length)
    return (
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <div className="empty-text">Nenhuma categoria configurada</div>
      </div>
    );
  if (total === 0)
    return (
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <div className="empty-text">Nenhuma despesa paga registrada</div>
      </div>
    );

  const slices = categories
    .map((cat, i) => ({
      label: cat.name,
      value: byCategory[cat.id] || 0,
      color: CAT_COLORS[i % CAT_COLORS.length],
    }))
    .filter((s) => s.value > 0);
  if (uncategorized > 0)
    slices.push({
      label: "Sem categoria",
      value: uncategorized,
      color: "#64748b",
    });

  const size = 180,
    cx = size / 2,
    cy = size / 2,
    r = 68,
    innerR = 40;
  let startAngle = -Math.PI / 2;
  const paths = slices.map((slice) => {
    const pct = slice.value / total;
    const angle = pct * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle),
      y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle),
      y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle),
      iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle),
      iy2 = cy + innerR * Math.sin(startAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const d = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      "Z",
    ].join(" ");
    startAngle = endAngle;
    return { ...slice, d, pct };
  });

  const [hovered, setHovered] = useState(null);

  return (
    <div className="pie-chart-container">
      <div className="pie-svg-wrap">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {paths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              fill={p.color}
              opacity={hovered === null || hovered === i ? 1 : 0.4}
              stroke="var(--bg-card)"
              strokeWidth="2"
              style={{ cursor: "pointer", transition: "opacity 0.2s" }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
          <text
            x={cx}
            y={cy - 8}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-muted)"
            fontFamily="DM Sans"
          >
            {hovered !== null ? paths[hovered].label : "Total"}
          </text>
          <text
            x={cx}
            y={cy + 10}
            textAnchor="middle"
            fontSize="10"
            fill="var(--text-primary)"
            fontWeight="700"
            fontFamily="DM Mono"
          >
            {hovered !== null
              ? formatCurrency(paths[hovered].value)
              : formatCurrency(total)}
          </text>
          {hovered !== null && (
            <text
              x={cx}
              y={cy + 24}
              textAnchor="middle"
              fontSize="9"
              fill="var(--text-muted)"
              fontFamily="DM Mono"
            >
              {(paths[hovered].pct * 100).toFixed(1)}%
            </text>
          )}
        </svg>
      </div>
      <div className="pie-legend">
        {paths.map((p, i) => (
          <div
            key={i}
            className={`pie-legend-item ${hovered === i ? "active" : ""}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              className="cat-dot"
              style={{ background: p.color, width: 10, height: 10 }}
            />
            <span className="pie-legend-label">{p.label}</span>
            <span className="pie-legend-value">
              {(p.pct * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Comparison Chart ─────────────────────────────────────────────────────────
function ComparisonChart({ summary }) {
  if (!summary || !summary.categoryBreakdown?.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📈</div>
        <div className="empty-text">Sem dados para comparar</div>
      </div>
    );
  }
  return (
    <div className="comparison-chart-v2">
      {summary.categoryBreakdown.map((cat, i) => {
        const over = cat.spent_amount > cat.planned_amount;
        const pct =
          cat.planned_amount > 0
            ? Math.min((cat.spent_amount / cat.planned_amount) * 100, 100)
            : 0;
        return (
          <div key={cat.id} className="comp-v2-item">
            <div className="comp-v2-label">
              <span
                className="cat-dot"
                style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}
              />
              <span>{cat.name}</span>
            </div>
            <div className="comp-v2-bar-wrap">
              <div className="comp-v2-track">
                <div
                  className={`comp-v2-fill ${over ? "over" : ""}`}
                  style={{
                    width: `${pct}%`,
                    background: over
                      ? "linear-gradient(90deg, var(--danger), #f97316)"
                      : `linear-gradient(90deg, ${CAT_COLORS[i % CAT_COLORS.length]}cc, ${CAT_COLORS[i % CAT_COLORS.length]})`,
                  }}
                />
              </div>
              <span
                className="comp-v2-values"
                style={{ color: over ? "var(--danger)" : "var(--text-muted)" }}
              >
                {formatCurrency(cat.spent_amount)}
                <span className="comp-v2-sep">/</span>
                {formatCurrency(cat.planned_amount)}
              </span>
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
      ? initialCategories.map((c) => ({ ...c }))
      : [],
  );
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const totalPct = cats.reduce(
    (s, c) => s + (parseFloat(c.percentage) || 0),
    0,
  );

  function addCat() {
    if (cats.length >= 6) {
      toast("Máximo de 6 categorias", "error");
      return;
    }
    setCats((prev) => [...prev, { name: "", percentage: 0 }]);
  }

  function removeCat(i) {
    setCats((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateCat(i, field, val) {
    setCats((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, [field]: val } : c)),
    );
  }

  async function save() {
    if (totalPct > 100.01) {
      toast("Total de porcentagens excede 100%", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await api.put(`/categories/month/${monthId}`, {
        categories: cats,
      });
      onSaved(res.categories);
      toast("Categorias salvas com sucesso!", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="category-editor">
      {cats.map((cat, i) => (
        <div key={i} className="category-row">
          <input
            placeholder={`Categoria ${i + 1}`}
            value={cat.name}
            onChange={(e) => updateCat(i, "name", e.target.value)}
          />
          <div style={{ position: "relative" }}>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={cat.percentage}
              onChange={(e) =>
                updateCat(i, "percentage", parseFloat(e.target.value) || 0)
              }
              style={{ paddingRight: "24px" }}
            />
            <span
              style={{
                position: "absolute",
                right: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "0.75rem",
                color: "var(--text-muted)",
              }}
            >
              %
            </span>
          </div>
          <button
            className="btn btn-danger btn-icon btn-sm"
            onClick={() => removeCat(i)}
          >
            ✕
          </button>
        </div>
      ))}
      {cats.length < 6 && (
        <button className="add-category-btn" onClick={addCat}>
          <span>＋</span> Adicionar categoria
        </button>
      )}
      <div className={`pct-total ${totalPct > 100 ? "over" : ""}`}>
        Total: {totalPct.toFixed(1)}%{" "}
        {totalPct > 100
          ? "⚠ Excede 100%"
          : totalPct < 100
            ? `(${(100 - totalPct).toFixed(1)}% livre)`
            : "✓"}
      </div>
      <button
        className="btn btn-primary w-full"
        onClick={save}
        disabled={saving}
      >
        {saving ? "Salvando..." : "Salvar Categorias"}
      </button>
    </div>
  );
}

// ─── Transaction Modal ────────────────────────────────────────────────────────
function TransactionModal({
  year,
  month,
  categories,
  onClose,
  onSaved,
  editData,
}) {
  const [form, setForm] = useState(
    editData
      ? {
          description: editData.description || "",
          amount: editData.amount || "",
          payment_method: editData.payment_method || "Pix",
          payment_type: editData.payment_type || "avista",
          category_id: editData.category_id || "",
          due_date: editData.due_date || "",
          paid: !!editData.paid,
          installments: 2,
        }
      : {
          description: "",
          amount: "",
          payment_method: "Pix",
          payment_type: "avista",
          category_id: "",
          due_date: "",
          paid: false,
          installments: 2,
        },
  );
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const isEdit = !!editData;

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    if (!form.description.trim()) {
      toast("Informe a descrição", "error");
      return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast("Informe um valor válido", "error");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/transactions/${editData.id}`, {
          description: form.description.trim(),
          amount: parseFloat(form.amount),
          payment_method: form.payment_method,
          payment_type: form.payment_type,
          category_id: form.category_id || null,
          due_date: form.due_date,
          paid: form.paid,
        });
        toast("Despesa atualizada!", "success");
      } else {
        await api.post("/transactions", {
          year,
          month,
          description: form.description.trim(),
          amount: parseFloat(form.amount),
          payment_method: form.payment_method,
          payment_type: form.payment_type,
          category_id: form.category_id || null,
          due_date: form.due_date,
          paid: form.paid,
          installments:
            form.payment_type === "parcelado" ? form.installments : 1,
        });
        toast(
          form.payment_type === "parcelado"
            ? `${form.installments} parcelas criadas!`
            : "Despesa registrada!",
          "success",
        );
      }
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">
            {isEdit ? "✏️ Editar Despesa" : "📋 Nova Despesa"}
          </span>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group full">
              <label>Descrição *</label>
              <input
                placeholder="Ex: Aluguel, Supermercado..."
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Valor (R$) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={form.amount}
                onChange={(e) => setField("amount", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Forma de Pagamento</label>
              <select
                value={form.payment_method}
                onChange={(e) => setField("payment_method", e.target.value)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            {!isEdit && (
              <div className="form-group">
                <label>Tipo</label>
                <select
                  value={form.payment_type}
                  onChange={(e) => setField("payment_type", e.target.value)}
                >
                  <option value="avista">À Vista</option>
                  <option value="parcelado">Parcelado</option>
                </select>
              </div>
            )}
            {!isEdit && form.payment_type === "parcelado" && (
              <div className="form-group">
                <label>Nº de Parcelas</label>
                <input
                  type="number"
                  min="2"
                  max="60"
                  value={form.installments}
                  onChange={(e) =>
                    setField("installments", parseInt(e.target.value) || 2)
                  }
                />
              </div>
            )}
            <div className="form-group">
              <label>Categoria</label>
              <select
                value={form.category_id}
                onChange={(e) => setField("category_id", e.target.value)}
              >
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Data de Vencimento</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setField("due_date", e.target.value)}
              />
            </div>
            <div className="form-group full">
              <div className="checkbox-row">
                <input
                  type="checkbox"
                  id="paid-cb"
                  checked={form.paid}
                  onChange={(e) => setField("paid", e.target.checked)}
                />
                <label htmlFor="paid-cb">Marcar como pago</label>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={saving}
          >
            {saving
              ? "Salvando..."
              : isEdit
                ? "Salvar Alterações"
                : form.payment_type === "parcelado"
                  ? `Criar ${form.installments} parcelas`
                  : "Salvar Despesa"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Income Modal ─────────────────────────────────────────────────────────────
function IncomeModal({ year, month, onClose, onSaved, editData }) {
  const [form, setForm] = useState(
    editData
      ? {
          description: editData.description || "",
          amount: editData.amount || "",
          received: !!editData.received,
        }
      : { description: "", amount: "", received: false },
  );
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const isEdit = !!editData;

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    if (!form.description.trim()) {
      toast("Informe a descrição", "error");
      return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast("Informe um valor válido", "error");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/incomes/${editData.id}`, {
          description: form.description.trim(),
          amount: parseFloat(form.amount),
          received: form.received,
        });
        toast("Entrada atualizada!", "success");
      } else {
        await api.post("/incomes", {
          year,
          month,
          description: form.description.trim(),
          amount: parseFloat(form.amount),
          received: form.received,
        });
        toast("Entrada registrada!", "success");
      }
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">
            {isEdit ? "✏️ Editar Entrada" : "💰 Nova Entrada"}
          </span>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group full">
              <label>Descrição *</label>
              <input
                placeholder="Ex: Salário, Freelance..."
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </div>
            <div className="form-group full">
              <label>Valor (R$) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={form.amount}
                onChange={(e) => setField("amount", e.target.value)}
              />
            </div>
            <div className="form-group full">
              <div className="checkbox-row">
                <input
                  type="checkbox"
                  id="recv-cb"
                  checked={form.received}
                  onChange={(e) => setField("received", e.target.checked)}
                />
                <label htmlFor="recv-cb">Marcar como recebido</label>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-success"
            onClick={submit}
            disabled={saving}
          >
            {saving
              ? "Salvando..."
              : isEdit
                ? "Salvar Alterações"
                : "Salvar Entrada"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Category Modal ────────────────────────────────────────────────────────────
function CategoryModal({ monthId, categories, onClose, onSaved }) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">⚙️ Configurar Categorias</span>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="text-muted mb-4">
            Defina até 6 categorias e suas porcentagens do orçamento.
          </p>
          <CategoryEditor
            monthId={monthId}
            initialCategories={categories}
            onSaved={(updated) => {
              onSaved(updated);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Transactions Table ────────────────────────────────────────────────────────
function TransactionsTable({
  transactions,
  categories,
  onTogglePaid,
  onDelete,
  onEdit,
}) {
  const toast = useToast();

  async function togglePaid(tx) {
    try {
      await api.patch(`/transactions/${tx.id}`, { paid: !tx.paid });
      onTogglePaid();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function del(tx) {
    const isGroup = tx.is_installment && tx.total_installments > 1;
    let deleteAll = false;
    if (isGroup)
      deleteAll = window.confirm(
        `Esta é uma parcela (${tx.installment_number}/${tx.total_installments}).\n\nOK = Deletar TODAS as parcelas\nCancelar = Deletar só esta`,
      );
    try {
      await api.delete(`/transactions/${tx.id}${deleteAll ? "?all=true" : ""}`);
      toast("Deletado", "info");
      onDelete();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  if (!transactions.length)
    return (
      <div className="empty-state">
        <div className="empty-icon">📄</div>
        <div className="empty-text">Nenhuma despesa registrada</div>
      </div>
    );

  const catMap = {};
  categories.forEach((c, i) => {
    catMap[c.id] = { ...c, color: CAT_COLORS[i % CAT_COLORS.length] };
  });

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
          {transactions.map((tx) => {
            const cat = catMap[tx.category_id];
            const days = daysUntil(tx.due_date);
            return (
              <tr key={tx.id}>
                <td>
                  <button
                    className={`paid-toggle ${tx.paid ? "active" : ""}`}
                    onClick={() => togglePaid(tx)}
                    title={
                      tx.paid ? "Marcar como não pago" : "Marcar como pago"
                    }
                  />
                </td>
                <td>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 2 }}
                  >
                    <span style={{ fontWeight: 500 }}>{tx.description}</span>
                    {tx.is_installment && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        Parcela {tx.installment_number}/{tx.total_installments}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  {cat ? (
                    <span
                      className="flex gap-2"
                      style={{ alignItems: "center" }}
                    >
                      <span
                        className="cat-dot"
                        style={{ background: cat.color }}
                      />
                      {cat.name}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="td-mono" style={{ fontWeight: 600 }}>
                  {formatCurrency(tx.amount)}
                </td>
                <td>
                  {tx.due_date ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      <span>{formatDate(tx.due_date)}</span>
                      {!tx.paid && days !== null && (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            color:
                              days < 0
                                ? "var(--danger)"
                                : days <= 3
                                  ? "var(--warning)"
                                  : "var(--text-muted)",
                          }}
                        >
                          {days < 0
                            ? `${Math.abs(days)}d atraso`
                            : days === 0
                              ? "Hoje"
                              : `${days}d`}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td>
                  <span className="badge badge-muted">
                    {tx.payment_method || "—"}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      className="btn btn-edit btn-icon btn-sm"
                      onClick={() => onEdit(tx)}
                      title="Editar"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn btn-danger btn-icon btn-sm"
                      onClick={() => del(tx)}
                      title="Excluir"
                    >
                      ✕
                    </button>
                  </div>
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
function IncomesTable({ incomes, onToggle, onDelete, onEdit }) {
  const toast = useToast();

  async function toggle(inc) {
    try {
      await api.patch(`/incomes/${inc.id}`, { received: !inc.received });
      onToggle();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function del(inc) {
    try {
      await api.delete(`/incomes/${inc.id}`);
      toast("Deletado", "info");
      onDelete();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  if (!incomes.length)
    return (
      <div className="empty-state">
        <div className="empty-icon">💵</div>
        <div className="empty-text">Nenhuma entrada registrada</div>
      </div>
    );

  return (
    <div className="table-wrap">
      <table className="incomes-table">
        <thead>
          <tr>
            <th className="col-received">Recebido</th>
            <th>Descrição</th>
            <th>Valor</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {incomes.map((inc) => (
            <tr key={inc.id}>
              <td className="col-received">
                <button
                  className={`paid-toggle ${inc.received ? "active" : ""}`}
                  onClick={() => toggle(inc)}
                />
              </td>
              <td style={{ fontWeight: 500 }}>{inc.description}</td>
              <td
                className="td-mono"
                style={{ fontWeight: 600, color: "var(--success)" }}
              >
                {formatCurrency(inc.amount)}
              </td>
              <td>
                <div className="row-actions">
                  <button
                    className="btn btn-edit btn-icon btn-sm"
                    onClick={() => onEdit(inc)}
                    title="Editar"
                  >
                    ✏️
                  </button>
                  <button
                    className="btn btn-danger btn-icon btn-sm"
                    onClick={() => del(inc)}
                  >
                    ✕
                  </button>
                </div>
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
      toast("Marcado como pago!", "success");
      onRefresh();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  const all = [...overdue.map((t) => ({ ...t, _over: true })), ...upcoming];
  if (!all.length)
    return (
      <div className="empty-state">
        <div className="empty-icon">✅</div>
        <div className="empty-text">Sem contas a vencer</div>
      </div>
    );

  return (
    <div className="bills-list">
      {all.map((tx) => {
        const days = daysUntil(tx.due_date);
        return (
          <div key={tx.id} className={`bill-item ${tx._over ? "overdue" : ""}`}>
            <div className="bill-info">
              <span className="bill-desc">{tx.description}</span>
              <span className="bill-meta">
                {tx.category_name ? `${tx.category_name} · ` : ""}Vence{" "}
                {formatDate(tx.due_date)}
                {days !== null && (
                  <span
                    style={{
                      color: tx._over
                        ? "var(--danger)"
                        : days <= 3
                          ? "var(--warning)"
                          : "var(--text-muted)",
                    }}
                  >
                    {tx._over
                      ? ` (${Math.abs(days)}d atraso)`
                      : days === 0
                        ? " (Hoje)"
                        : ` (${days}d)`}
                  </span>
                )}
              </span>
            </div>
            <div className="bill-right">
              <span className="bill-amount">{formatCurrency(tx.amount)}</span>
              <button
                className="btn btn-success btn-sm"
                onClick={() => markPaid(tx)}
              >
                Pagar
              </button>
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
      <div className={`kpi-card balance ${isNeg ? "negative" : ""}`}>
        <div className="kpi-label">Saldo</div>
        <div className={`kpi-value ${isNeg ? "negative" : "positive"}`}>
          {formatCurrency(balance)}
        </div>
        <div className="kpi-icon">{isNeg ? "📉" : "📈"}</div>
      </div>
    </div>
  );
}

// ─── Month View ────────────────────────────────────────────────────────────────
function MonthView({ year, month, darkMode, toggleTheme }) {
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showTxModal, setShowTxModal] = useState(false);
  const [showIncModal, setShowIncModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editTx, setEditTx] = useState(null);
  const [editInc, setEditInc] = useState(null);
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
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading)
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  if (!data) return null;

  const { categories = [], transactions = [], incomes = [] } = data;

  return (
    <>
      <div className="top-bar">
        <div className="page-title">
          {MONTH_NAMES[month - 1]}
          <span className="month-badge">{year}</span>
        </div>
        <div className="top-bar-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowCatModal(true)}
          >
            ⚙️ Categorias
          </button>
          <button
            className="btn btn-success btn-sm"
            onClick={() => setShowIncModal(true)}
          >
            ＋ Entrada
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowTxModal(true)}
          >
            ＋ Despesa
          </button>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            style={{ width: "auto", padding: "6px 12px", fontSize: "0.75rem" }}
          >
            {darkMode ? "☀️ Claro" : "🌙 Escuro"}
          </button>
        </div>
      </div>

      <div className="content-scroll">
        <div className="tabs">
          {[
            ["dashboard", "📊 Dashboard"],
            ["transactions", "📋 Despesas"],
            ["incomes", "💰 Entradas"],
          ].map(([k, label]) => (
            <button
              key={k}
              className={`tab-btn ${activeTab === k ? "active" : ""}`}
              onClick={() => setActiveTab(k)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "dashboard" && (
          <>
            <KpiStrip summary={summary} />
            <div className="dashboard-grid">
              <div className="card">
                <div className="card-header">
                  <span className="card-title">
                    📊 Distribuição por Categoria
                  </span>
                </div>
                <PieChart categories={categories} transactions={transactions} />
              </div>
              <div className="card">
                <div className="card-header">
                  <span className="card-title">🔔 Contas a Vencer</span>
                </div>
                <UpcomingBills summary={summary} onRefresh={load} />
              </div>
              <div className="card full-width">
                <div className="card-header">
                  <span className="card-title">📈 Planejado vs Realizado</span>
                </div>
                <ComparisonChart summary={summary} />
              </div>
            </div>
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
                              <span
                                className="flex gap-2"
                                style={{ alignItems: "center" }}
                              >
                                <span
                                  className="cat-dot"
                                  style={{
                                    background:
                                      CAT_COLORS[i % CAT_COLORS.length],
                                  }}
                                />
                                {cat.name}
                              </span>
                            </td>
                            <td className="td-mono">
                              {cat.percentage.toFixed(1)}%
                            </td>
                            <td className="td-mono">
                              {formatCurrency(cat.planned_amount)}
                            </td>
                            <td className="td-mono" style={{ fontWeight: 600 }}>
                              {formatCurrency(cat.spent_amount)}
                            </td>
                            <td
                              className="td-mono"
                              style={{
                                color: over
                                  ? "var(--danger)"
                                  : "var(--success)",
                                fontWeight: 600,
                              }}
                            >
                              {over ? "-" : "+"}
                              {formatCurrency(Math.abs(diff))}
                            </td>
                            <td>
                              <span
                                className={`badge ${over ? "badge-danger" : "badge-success"}`}
                              >
                                {over ? "Excedido" : "OK"}
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

        {activeTab === "transactions" && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">📋 Despesas do Mês</span>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowTxModal(true)}
              >
                ＋ Nova
              </button>
            </div>
            <TransactionsTable
              transactions={transactions}
              categories={categories}
              onTogglePaid={load}
              onDelete={load}
              onEdit={(tx) => setEditTx(tx)}
            />
          </div>
        )}

        {activeTab === "incomes" && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">💰 Entradas do Mês</span>
              <button
                className="btn btn-success btn-sm"
                onClick={() => setShowIncModal(true)}
              >
                ＋ Nova
              </button>
            </div>
            <IncomesTable
              incomes={incomes}
              onToggle={load}
              onDelete={load}
              onEdit={(inc) => setEditInc(inc)}
            />
          </div>
        )}
      </div>

      {showTxModal && (
        <TransactionModal
          year={year}
          month={month}
          categories={categories}
          onClose={() => setShowTxModal(false)}
          onSaved={() => {
            setShowTxModal(false);
            load();
          }}
        />
      )}
      {editTx && (
        <TransactionModal
          year={year}
          month={month}
          categories={categories}
          editData={editTx}
          onClose={() => setEditTx(null)}
          onSaved={() => {
            setEditTx(null);
            load();
          }}
        />
      )}
      {showIncModal && (
        <IncomeModal
          year={year}
          month={month}
          onClose={() => setShowIncModal(false)}
          onSaved={() => {
            setShowIncModal(false);
            load();
          }}
        />
      )}
      {editInc && (
        <IncomeModal
          year={year}
          month={month}
          editData={editInc}
          onClose={() => setEditInc(null)}
          onSaved={() => {
            setEditInc(null);
            load();
          }}
        />
      )}
      {showCatModal && (
        <CategoryModal
          monthId={data.month.id}
          categories={categories}
          onClose={() => setShowCatModal(false)}
          onSaved={(updated) => {
            setData((d) => ({ ...d, categories: updated }));
            load();
          }}
        />
      )}
    </>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ year, month, onSelectMonth, onYearChange }) {
  const { user, doLogout } = useAuth();
  const toast = useToast();

  function handleLogout() {
    doLogout();
    toast("Sessão encerrada", "info");
  }

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
          <button className="year-btn" onClick={() => onYearChange(-1)}>
            ‹
          </button>
          <span className="year-display">{year}</span>
          <button className="year-btn" onClick={() => onYearChange(1)}>
            ›
          </button>
        </div>
      </div>

      <nav className="sidebar-months">
        {MONTH_NAMES.map((name, i) => (
          <button
            key={i}
            className={`month-btn ${month === i + 1 ? "active" : ""}`}
            onClick={() => onSelectMonth(i + 1)}
          >
            <span className="month-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{name}</span>
          </button>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="sidebar-footer">
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {user.name?.charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user.name}</span>
              <span className="sidebar-user-email">{user.email}</span>
            </div>
            <button
              className="sidebar-logout-btn"
              onClick={handleLogout}
              title="Sair"
            >
              <i className="bx bx-log-out" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── App Content (protegido) ───────────────────────────────────────────────────
function AppContent() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [darkMode, toggleTheme] = useTheme();
  const { logged } = useAuth();

  if (!logged) return <LoginPage />;

  return (
    <div className="app-shell">
      <Sidebar
        year={year}
        month={month}
        onSelectMonth={setMonth}
        onYearChange={(delta) => setYear((y) => y + delta)}
      />
      <main className="main-content">
        <MonthView
          key={`${year}-${month}`}
          year={year}
          month={month}
          darkMode={darkMode}
          toggleTheme={toggleTheme}
        />
      </main>
    </div>
  );
}

// ─── App Root ──────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
