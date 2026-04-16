'use strict';

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');

// ─── Configuração ───────────────────────────────────────────────────────────

const PORT = 3004;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.db');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Banco de Dados ──────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS months (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      UNIQUE(year, month)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      percentage REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (month_id) REFERENCES months(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT '',
      payment_type TEXT NOT NULL DEFAULT 'avista',
      category_id INTEGER,
      due_date TEXT DEFAULT '',
      paid INTEGER NOT NULL DEFAULT 0,
      is_installment INTEGER DEFAULT 0,
      installment_group_id TEXT DEFAULT '',
      installment_number INTEGER DEFAULT 1,
      total_installments INTEGER DEFAULT 1,
      FOREIGN KEY (month_id) REFERENCES months(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS incomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      received INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (month_id) REFERENCES months(id) ON DELETE CASCADE
    );
  `);
}

initDatabase();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok(res, data) {
  return res.json({ success: true, data });
}

function fail(res, message, status = 400) {
  return res.status(status).json({ success: false, error: message });
}

function getOrCreateMonth(year, month) {
  const existing = db.prepare('SELECT * FROM months WHERE year = ? AND month = ?').get(year, month);
  if (existing) return existing;
  const result = db.prepare('INSERT INTO months (year, month) VALUES (?, ?)').run(year, month);
  return db.prepare('SELECT * FROM months WHERE id = ?').get(result.lastInsertRowid);
}

// Adiciona N meses a uma data ISO (YYYY-MM-DD)
function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let newMonth = m + n;
  let newYear = y;
  while (newMonth > 12) { newMonth -= 12; newYear++; }
  const maxDay = new Date(newYear, newMonth, 0).getDate();
  const day = Math.min(d, maxDay);
  return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Rotas: Meses ────────────────────────────────────────────────────────────

// GET /api/months/:year/:month — retorna ou cria o mês com dados completos
app.get('/api/months/:year/:month', (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return fail(res, 'Ano ou mês inválido');
    }
    const monthRecord = getOrCreateMonth(year, month);
    const categories = db.prepare('SELECT * FROM categories WHERE month_id = ? ORDER BY id').all(monthRecord.id);
    const transactions = db.prepare('SELECT t.*, c.name as category_name FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.month_id = ? ORDER BY t.due_date ASC, t.id ASC').all(monthRecord.id);
    const incomes = db.prepare('SELECT * FROM incomes WHERE month_id = ? ORDER BY id').all(monthRecord.id);

    ok(res, { month: monthRecord, categories, transactions, incomes });
  } catch (err) {
    fail(res, err.message, 500);
  }
});

// ─── Rotas: Categorias ───────────────────────────────────────────────────────

// PUT /api/categories/month/:monthId — salva/atualiza todas as categorias do mês
app.put('/api/categories/month/:monthId', (req, res) => {
  try {
    const monthId = parseInt(req.params.monthId);
    const { categories } = req.body;

    if (!Array.isArray(categories)) return fail(res, 'categories deve ser um array');
    if (categories.length > 6) return fail(res, 'Máximo de 6 categorias por mês');

    const totalPct = categories.reduce((s, c) => s + (parseFloat(c.percentage) || 0), 0);
    if (totalPct > 100.01) return fail(res, `Total de porcentagens (${totalPct.toFixed(1)}%) excede 100%`);

    const upsert = db.transaction(() => {
      db.prepare('DELETE FROM categories WHERE month_id = ?').run(monthId);
      const insert = db.prepare('INSERT INTO categories (month_id, name, percentage) VALUES (?, ?, ?)');
      for (const cat of categories) {
        if (!cat.name || cat.name.trim() === '') continue;
        insert.run(monthId, cat.name.trim(), parseFloat(cat.percentage) || 0);
      }
    });
    upsert();

    const updated = db.prepare('SELECT * FROM categories WHERE month_id = ? ORDER BY id').all(monthId);
    ok(res, { categories: updated });
  } catch (err) {
    fail(res, err.message, 500);
  }
});

// ─── Rotas: Transações ────────────────────────────────────────────────────────

// POST /api/transactions — cria transação (à vista ou parcelada)
app.post('/api/transactions', (req, res) => {
  try {
    const {
      year, month,
      description, amount, payment_method,
      payment_type, category_id, due_date,
      paid, installments
    } = req.body;

    if (!description || !amount || !year || !month) {
      return fail(res, 'Campos obrigatórios: description, amount, year, month');
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return fail(res, 'Valor inválido');

    const insert = db.prepare(`
      INSERT INTO transactions
        (month_id, description, amount, payment_method, payment_type, category_id, due_date, paid,
         is_installment, installment_group_id, installment_number, total_installments)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const created = [];

    if (payment_type === 'parcelado' && installments && parseInt(installments) > 1) {
      const total = parseInt(installments);
      const groupId = randomUUID();
      const installmentAmount = parsedAmount / total;

      const createInstallments = db.transaction(() => {
        for (let i = 0; i < total; i++) {
          const installmentDueDate = due_date ? addMonths(due_date, i) : '';
          const [iYear, iMonth] = installmentDueDate
            ? installmentDueDate.split('-').map(Number)
            : [year, month];
          const monthRecord = getOrCreateMonth(iYear || year, iMonth || month);
          const result = insert.run(
            monthRecord.id,
            `${description} (${i + 1}/${total})`,
            installmentAmount,
            payment_method || '',
            'parcelado',
            category_id || null,
            installmentDueDate,
            i === 0 ? (paid ? 1 : 0) : 0,
            1,
            groupId,
            i + 1,
            total
          );
          created.push({ id: result.lastInsertRowid, installment: i + 1 });
        }
      });
      createInstallments();
    } else {
      const monthRecord = getOrCreateMonth(parseInt(year), parseInt(month));
      const result = insert.run(
        monthRecord.id,
        description,
        parsedAmount,
        payment_method || '',
        'avista',
        category_id || null,
        due_date || '',
        paid ? 1 : 0,
        0, '', 1, 1
      );
      created.push({ id: result.lastInsertRowid });
    }

    ok(res, { created });
  } catch (err) {
    fail(res, err.message, 500);
  }
});

// PATCH /api/transactions/:id — atualiza campos específicos
app.patch('/api/transactions/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const fields = req.body;
    const allowed = ['description', 'amount', 'payment_method', 'payment_type', 'category_id', 'due_date', 'paid'];

    const setClauses = [];
    const values = [];

    for (const key of allowed) {
      if (key in fields) {
        setClauses.push(`${key} = ?`);
        values.push(key === 'paid' ? (fields[key] ? 1 : 0) : fields[key]);
      }
    }

    if (setClauses.length === 0) return fail(res, 'Nenhum campo válido para atualizar');

    values.push(id);
    db.prepare(`UPDATE transactions SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    ok(res, { transaction: updated });
  } catch (err) {
    fail(res, err.message, 500);
  }
});

// DELETE /api/transactions/:id
app.delete('/api/transactions/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!tx) return fail(res, 'Transação não encontrada', 404);

    if (tx.is_installment && tx.installment_group_id) {
      // Pergunta se deleta só essa ou todas — frontend decide mandando query param
      const deleteAll = req.query.all === 'true';
      if (deleteAll) {
        db.prepare('DELETE FROM transactions WHERE installment_group_id = ?').run(tx.installment_group_id);
      } else {
        db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
      }
    } else {
      db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    }

    ok(res, { deleted: true });
  } catch (err) {
    fail(res, err.message, 500);
  }
});

// ─── Rotas: Entradas ──────────────────────────────────────────────────────────

// POST /api/incomes
app.post('/api/incomes', (req, res) => {
  try {
    const { year, month, description, amount, received } = req.body;
    if (!description || !amount || !year || !month) {
      return fail(res, 'Campos obrigatórios: description, amount, year, month');
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return fail(res, 'Valor inválido');

    const monthRecord = getOrCreateMonth(parseInt(year), parseInt(month));
    const result = db.prepare(
      'INSERT INTO incomes (month_id, description, amount, received) VALUES (?, ?, ?, ?)'
    ).run(monthRecord.id, description, parsedAmount, received ? 1 : 0);

    ok(res, { income: db.prepare('SELECT * FROM incomes WHERE id = ?').get(result.lastInsertRowid) });
  } catch (err) {
    fail(res, err.message, 500);
  }
});

// PATCH /api/incomes/:id
app.patch('/api/incomes/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { description, amount, received } = req.body;
    const sets = [];
    const vals = [];
    if (description !== undefined) { sets.push('description = ?'); vals.push(description); }
    if (amount !== undefined) { sets.push('amount = ?'); vals.push(parseFloat(amount)); }
    if (received !== undefined) { sets.push('received = ?'); vals.push(received ? 1 : 0); }
    if (!sets.length) return fail(res, 'Nada para atualizar');
    vals.push(id);
    db.prepare(`UPDATE incomes SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    ok(res, { income: db.prepare('SELECT * FROM incomes WHERE id = ?').get(id) });
  } catch (err) {
    fail(res, err.message, 500);
  }
});

// DELETE /api/incomes/:id
app.delete('/api/incomes/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM incomes WHERE id = ?').run(parseInt(req.params.id));
    ok(res, { deleted: true });
  } catch (err) {
    fail(res, err.message, 500);
  }
});

// ─── Rotas: Resumo / Dashboard ────────────────────────────────────────────────

// GET /api/summary/:year/:month — dados consolidados para o dashboard
app.get('/api/summary/:year/:month', (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    const monthRecord = db.prepare('SELECT * FROM months WHERE year = ? AND month = ?').get(year, month);
    if (!monthRecord) return ok(res, { summary: null });

    const categories = db.prepare('SELECT * FROM categories WHERE month_id = ?').all(monthRecord.id);
    const paidTransactions = db.prepare(
      'SELECT * FROM transactions WHERE month_id = ? AND paid = 1'
    ).all(monthRecord.id);
    const receivedIncomes = db.prepare(
      'SELECT * FROM incomes WHERE month_id = ? AND received = 1'
    ).all(monthRecord.id);

    const totalIncome = receivedIncomes.reduce((s, i) => s + i.amount, 0);
    const totalExpenses = paidTransactions.reduce((s, t) => s + t.amount, 0);

    // Gasto real por categoria
    const spentByCategory = {};
    for (const cat of categories) { spentByCategory[cat.id] = 0; }
    for (const tx of paidTransactions) {
      if (tx.category_id && spentByCategory[tx.category_id] !== undefined) {
        spentByCategory[tx.category_id] += tx.amount;
      }
    }

    const categoryBreakdown = categories.map(cat => ({
      ...cat,
      planned_amount: totalIncome * (cat.percentage / 100),
      spent_amount: spentByCategory[cat.id] || 0,
    }));

    // Contas a vencer (não pagas, com data de vencimento futura ou hoje)
    const today = new Date().toISOString().split('T')[0];
    const upcoming = db.prepare(
      `SELECT t.*, c.name as category_name FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.month_id = ? AND t.paid = 0 AND t.due_date != '' AND t.due_date >= ?
       ORDER BY t.due_date ASC`
    ).all(monthRecord.id, today);

    const overdue = db.prepare(
      `SELECT t.*, c.name as category_name FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.month_id = ? AND t.paid = 0 AND t.due_date != '' AND t.due_date < ?
       ORDER BY t.due_date ASC`
    ).all(monthRecord.id, today);

    ok(res, {
      summary: {
        totalIncome,
        totalExpenses,
        balance: totalIncome - totalExpenses,
        categoryBreakdown,
        upcoming,
        overdue,
      }
    });
  } catch (err) {
    fail(res, err.message, 500);
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => ok(res, { status: 'ok', ts: Date.now() }));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`FinanceFlow backend rodando em http://127.0.0.1:${PORT}`);
});
