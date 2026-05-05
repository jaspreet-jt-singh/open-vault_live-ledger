import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import './index.css';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar, 
  CreditCard, 
  User, 
  LogOut, 
  Plus,
  Trash2,
  Edit3,
  ChevronLeft,
  ChevronRight,
  Search,
  TrendingUp,
  TrendingDown,
  Clock
} from 'lucide-react';

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [user, setUser] = useState(null);
  const [cashForm, setCashForm] = useState({ amount: "", name: "", type: "debit" });
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, credit: 0, debit: 0 });

  // Edit State
  const [editingTx, setEditingTx] = useState(null);
  const [editForm, setEditForm] = useState({ amount: "", name: "", type: "debit" });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 10;

  const isAuthParamPresent = new URLSearchParams(window.location.search).get('auth') === 'true';

  useEffect(() => {
    fetchTransactions();
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [currentPage]); // Re-fetch whenever currentPage changes

  const fetchTransactions = async () => {
    setLoading(true);
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('tx_time', { ascending: false })
      .range(from, to);

    if (!error) {
      setTransactions(data);
      setHasMore(data.length === pageSize);
      
      // Calculate stats from all transactions (fetch summary separately)
      const { data: allData } = await supabase
        .from('transactions')
        .select('type, amount');
      
      if (allData) {
        const credit = allData.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
        const debit = allData.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);
        setStats({ total: allData.length, credit, debit });
      }
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  const handleManualCash = async (e) => {
    e.preventDefault();
    
    // Fetch current transaction count for unique reference
    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true });
    
    const txNum = (count || 0) + 1;
    
    // Generate numeric-only cash reference: DDHHMMNNNN (10 digits)
    // Format: Day(2) + Hour(2) + Minute(2) + TxNumber(4)
    const now = new Date();
    const pad = (n, len = 2) => n.toString().padStart(len, '0');
    const cashRef = `${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(txNum, 4)}`;
    
    const cashData = {
      // tx_time omitted - database sets it automatically
      type: cashForm.type,
      amount: parseFloat(cashForm.amount),
      sender_name: cashForm.name,
      upi_id: "CASH",
      tx_ref: cashRef
    };

    const { data: inserted, error } = await supabase
      .from('transactions')
      .insert([cashData])
      .select()
      .single();
      
    if (!error && inserted) {
      setCashForm({ amount: "", name: "", type: "debit" });
      setCurrentPage(1);
      fetchTransactions();
      console.log('Added with DB time:', inserted.tx_time);
    } else {
      alert('Error adding transaction: ' + error?.message);
    }
  };

  const handleEdit = (tx) => {
    setEditingTx(tx);
    setEditForm({
      amount: tx.amount.toString(),
      name: tx.sender_name,
      type: tx.type
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    const { error } = await supabase
      .from('transactions')
      .update({
        amount: parseFloat(editForm.amount),
        sender_name: editForm.name,
        type: editForm.type
      })
      .eq('id', editingTx.id);

    if (!error) {
      setEditingTx(null);
      fetchTransactions();
    } else {
      alert('Error updating: ' + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this transaction?')) return;
    
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (!error) {
      fetchTransactions();
    } else {
      alert('Error deleting: ' + error.message);
    }
  };

  const formatDate = (dateStr) => {
    // Parse database timestamp directly without timezone conversion
    const match = dateStr?.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d+)/);
    if (!match) return { day: '-', month: '-', year: '-', time: '-' };
    
    const [, year, month, day, hour, minute] = match;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return {
      day: parseInt(day),
      month: months[parseInt(month) - 1],
      year: year,
      time: `${hour}:${minute}`
    };
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-purple-950 to-slate-950 text-white font-sans antialiased overflow-x-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-emerald-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-linear-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg shadow-purple-500/25">
              <Wallet className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-linear-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent">
                Open Vault
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">Financial Ledger</p>
            </div>
          </div>
          
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-xl rounded-full border border-white/10">
                <User className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-slate-300">{user.email?.split('@')[0]}</span>
              </div>
              <button 
                onClick={() => supabase.auth.signOut()} 
                className="p-2 hover:bg-white/10 rounded-full transition-all group"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5 text-slate-400 group-hover:text-rose-400 transition-colors" />
              </button>
            </div>
          ) : null}
        </header>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="relative group">
            <div className="absolute inset-0 bg-linear-to-r from-emerald-500/20 to-teal-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative p-5 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 hover:border-emerald-500/30 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Total Credit</span>
                <div className="p-1.5 bg-emerald-500/20 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
              </div>
              <p className="text-2xl font-bold text-emerald-400">{formatCurrency(stats.credit)}</p>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-linear-to-r from-rose-500/20 to-pink-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative p-5 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 hover:border-rose-500/30 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Total Debit</span>
                <div className="p-1.5 bg-rose-500/20 rounded-lg">
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                </div>
              </div>
              <p className="text-2xl font-bold text-rose-400">{formatCurrency(stats.debit)}</p>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-linear-to-r from-purple-500/20 to-pink-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative p-5 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 hover:border-purple-500/30 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Net Balance</span>
                <div className="p-1.5 bg-purple-500/20 rounded-lg">
                  <Wallet className="w-4 h-4 text-purple-400" />
                </div>
              </div>
              <p className={`text-2xl font-bold ${stats.credit - stats.debit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(stats.credit - stats.debit)}
              </p>
            </div>
          </div>
        </div>

        {/* Admin Panel */}
        {user && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Plus className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-semibold text-white">Add Transaction</h2>
            </div>
            <form onSubmit={handleManualCash} className="p-5 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-6">
                  <label className="text-xs text-slate-400 block mb-2">Description</label>
                  <input 
                    required 
                    type="text" 
                    value={cashForm.name} 
                    onChange={e => setCashForm({...cashForm, name: e.target.value})} 
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all placeholder:text-slate-600" 
                    placeholder="e.g., Dinner at NIT, Salary, etc." 
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="text-xs text-slate-400 block mb-2">Amount (₹)</label>
                  <input 
                    required 
                    type="number" 
                    step="0.01"
                    value={cashForm.amount} 
                    onChange={e => setCashForm({...cashForm, amount: e.target.value})} 
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all placeholder:text-slate-600" 
                    placeholder="0.00" 
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-400 block mb-2">Type</label>
                  <select 
                    value={cashForm.type} 
                    onChange={e => setCashForm({...cashForm, type: e.target.value})} 
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
                <div className="sm:col-span-1 flex items-end">
                  <button 
                    type="submit" 
                    className="w-full h-11.5 bg-linear-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-105 active:scale-95"
                  >
                    <Plus className="w-5 h-5 mx-auto" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Transactions List */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-semibold text-white">Recent Transactions</h2>
              <span className="ml-2 px-2.5 py-0.5 bg-white/10 rounded-full text-xs text-slate-400">
                {stats.total}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <Wallet className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">No transactions yet</p>
              <p className="text-sm mt-1">Add your first transaction to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx, index) => {
                const rankId = ((currentPage - 1) * pageSize) + index + 1;
                const isCredit = tx.type === 'credit';
                const isEditing = editingTx?.id === tx.id;
                const date = formatDate(tx.tx_time);

                return (
                  <div 
                    key={tx.id} 
                    className="group relative"
                  >
                    {isEditing ? (
                      <form onSubmit={handleUpdate} className="p-4 bg-white/10 backdrop-blur-xl rounded-2xl border border-purple-500/30 shadow-xl">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-5">
                            <label className="text-xs text-slate-400 block mb-1">Description</label>
                            <input 
                              type="text" 
                              value={editForm.name} 
                              onChange={e => setEditForm({...editForm, name: e.target.value})} 
                              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500/50" 
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="text-xs text-slate-400 block mb-1">Amount</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={editForm.amount} 
                              onChange={e => setEditForm({...editForm, amount: e.target.value})} 
                              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500/50" 
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs text-slate-400 block mb-1">Type</label>
                            <select 
                              value={editForm.type} 
                              onChange={e => setEditForm({...editForm, type: e.target.value})} 
                              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500/50"
                            >
                              <option value="debit">Debit</option>
                              <option value="credit">Credit</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2 flex gap-2 items-end">
                            <button type="submit" className="flex-1 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-sm font-medium transition-colors">
                              Save
                            </button>
                            <button 
                              type="button" 
                              onClick={() => setEditingTx(null)} 
                              className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg text-sm transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center gap-4 p-4 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/5 hover:border-white/10 hover:bg-white/10 transition-all group-hover:shadow-lg group-hover:shadow-black/20">
                        {/* Rank & Icon */}
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs text-slate-500 font-mono">#{rankId}</span>
                          <div className={`p-2 rounded-xl ${isCredit ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                            {isCredit ? (
                              <ArrowDownRight className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4 text-rose-400" />
                            )}
                          </div>
                        </div>

                        {/* Transaction Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-white truncate">{tx.sender_name}</h3>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {date.day} {date.month} {date.year}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {date.time}
                            </span>
                            <span className="font-mono text-slate-600">
                              Ref: {tx.tx_ref?.substring(0, 8).toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {/* Amount */}
                        <div className="text-right">
                          <p className={`text-lg font-bold font-mono ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isCredit ? '+' : '-'} {formatCurrency(tx.amount)}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {tx.upi_id === 'CASH' ? 'Cash' : tx.upi_id}
                          </p>
                        </div>

                        {/* Actions */}
                        {user && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleEdit(tx)} 
                              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit3 className="w-4 h-4 text-slate-400 hover:text-purple-400" />
                            </button>
                            <button 
                              onClick={() => handleDelete(tx.id)} 
                              className="p-2 hover:bg-rose-500/10 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 text-slate-400 hover:text-rose-400" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {transactions.length > 0 && (
          <div className="flex items-center justify-between pt-6 border-t border-white/5">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl transition-all text-sm font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            
            <div className="flex items-center gap-2">
              {Array.from({ length: Math.min(5, currentPage + 2) }, (_, i) => {
                const page = i + Math.max(1, currentPage - 2);
                if (page > currentPage + 1 && !hasMore) return null;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-10 h-10 rounded-xl text-sm font-medium transition-all ${
                      page === currentPage
                        ? 'bg-linear-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25'
                        : 'bg-white/5 hover:bg-white/10 text-slate-400'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
            
            <button 
              onClick={() => setCurrentPage(prev => prev + 1)}
              disabled={!hasMore}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl transition-all text-sm font-medium"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Stealth Login */}
      {!user && isAuthParamPresent && (
        <button 
          onClick={handleLogin} 
          className="fixed bottom-6 right-6 flex items-center gap-2 px-6 py-3 bg-linear-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-semibold rounded-full shadow-2xl shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-105 transition-all z-50"
        >
          <User className="w-4 h-4" />
          Admin Login
        </button>
      )}
    </div>
  );
}