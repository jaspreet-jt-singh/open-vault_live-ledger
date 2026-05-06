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
  Edit3,
  ChevronLeft,
  ChevronRight,
  Search,
  TrendingUp,
  TrendingDown,
  Clock,
  Eye,
  EyeOff
} from 'lucide-react';

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [user, setUser] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [manualForm, setManualForm] = useState({ 
    amount: "", 
    name: "", 
    type: "debit",
    tx_time: "", 
    upi_id: "",
    tx_ref: ""
  });
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, credit: 0, debit: 0 });

  // Edit State
  const [editingTx, setEditingTx] = useState(null);
  const [editForm, setEditForm] = useState({ 
    amount: "", 
    name: "", 
    type: "debit",
    tx_time: "",
    upi_id: "",
    tx_ref: ""
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [showHidden, setShowHidden] = useState(false);
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
  }, [currentPage, showHidden]); // Re-fetch when page or hidden toggle changes

  const fetchTransactions = async () => {
    setLoading(true);
    const from = (currentPage - 1) * pageSize;
    // Fetch one extra item to check if there's a next page
    const to = from + pageSize;

    let query = supabase
      .from('transactions')
      .select('*')
      .order('tx_time', { ascending: false });
    
    // Filter hidden transactions unless showing them
    if (!showHidden) {
      query = query.eq('is_hidden', false);
    }
    
    const { data, error } = await query.range(from, to);

    if (!error) {
      // If we got pageSize + 1 items, there's a next page
      setHasMore(data.length > pageSize);
      // Only display pageSize items (ignore the extra one used for hasMore check)
      setTransactions(data.slice(0, pageSize));
      
      // Calculate stats from visible transactions only
      let statsQuery = supabase.from('transactions').select('type, amount');
      if (!showHidden) {
        statsQuery = statsQuery.eq('is_hidden', false);
      }
      const { data: allData } = await statsQuery;
      
      if (allData) {
        const credit = allData.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
        const debit = allData.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);
        const total = allData.length;
        setStats({ total, credit, debit });
        setTotalPages(Math.ceil(total / pageSize));
      }
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    
    // Generate reference if not provided (10 digits: DDHHMMNNNN)
    let txRef = manualForm.tx_ref;
    if (!txRef) {
      const { count } = await supabase.from('transactions').select('*', { count: 'exact', head: true });
      const txNum = (count || 0) + 1;
      const now = new Date();
      const pad = (n, len = 2) => n.toString().padStart(len, '0');
      txRef = `${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(txNum, 4)}`;
    }
    
    const insertData = {
      type: manualForm.type,
      amount: parseFloat(manualForm.amount),
      sender_name: manualForm.name,
      upi_id: manualForm.upi_id || "CASH",
      tx_ref: txRef,
      // Only include tx_time if provided, otherwise let DB set it
      ...(manualForm.tx_time && { tx_time: manualForm.tx_time })
    };

    const { data: inserted, error } = await supabase
      .from('transactions')
      .insert([insertData])
      .select()
      .single();
      
    if (!error && inserted) {
      setManualForm({ amount: "", name: "", type: "debit", tx_time: "", upi_id: "", tx_ref: "" });
      setCurrentPage(1);
      fetchTransactions();
    } else {
      alert('Error adding transaction: ' + error?.message);
    }
  };

  const handleEdit = (tx) => {
    setEditingTx(tx);
    // Format tx_time for datetime-local input if present
    const txTime = tx.tx_time 
      ? tx.tx_time.slice(0, 16).replace(' ', 'T') 
      : "";
    setEditForm({
      amount: tx.amount.toString(),
      name: tx.sender_name,
      type: tx.type,
      tx_time: txTime,
      upi_id: tx.upi_id || "",
      tx_ref: tx.tx_ref || ""
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    
    const updateData = {
      amount: parseFloat(editForm.amount),
      sender_name: editForm.name,
      type: editForm.type,
      upi_id: editForm.upi_id || "CASH",
      tx_ref: editForm.tx_ref
    };
    
    // Only update time if provided
    if (editForm.tx_time) {
      updateData.tx_time = editForm.tx_time.replace('T', ' ');
    }
    
    const { error } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', editingTx.id);

    if (!error) {
      setEditingTx(null);
      fetchTransactions();
    } else {
      alert('Error updating: ' + error.message);
    }
  };

  const handleToggleHide = async (tx) => {
    const newHiddenState = !tx.is_hidden;
    const action = newHiddenState ? 'hide' : 'unhide';
    if (!confirm(`${action === 'hide' ? 'Hide' : 'Unhide'} this transaction?`)) return;
    
    const { error } = await supabase
      .from('transactions')
      .update({ is_hidden: newHiddenState })
      .eq('id', tx.id);

    if (!error) {
      fetchTransactions();
    } else {
      alert(`Error ${action}ing: ` + error.message);
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
    <div className={`min-h-screen font-sans antialiased overflow-x-hidden transition-colors duration-300 ${
      isDarkMode 
        ? 'bg-linear-to-br from-slate-950 via-purple-950 to-slate-950 text-white' 
        : 'bg-linear-to-br from-gray-100 via-purple-100 to-gray-100 text-slate-900'
    }`}>
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-1/2 -left-1/2 w-full h-full rounded-full blur-3xl animate-pulse ${
          isDarkMode ? 'bg-purple-500/10' : 'bg-purple-400/20'
        }`} />
        <div className={`absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full blur-3xl animate-pulse delay-1000 ${
          isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-400/20'
        }`} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-linear-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg shadow-purple-500/25">
              <Wallet className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className={`text-3xl font-bold bg-clip-text text-transparent ${
                isDarkMode 
                  ? 'bg-linear-to-r from-white via-purple-200 to-pink-200' 
                  : 'bg-linear-to-r from-slate-900 via-purple-600 to-pink-600'
              }`}>
                Open Vault
              </h1>
              <p className={`text-sm mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Live Financial Ledger</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-2 rounded-full transition-all ${
                isDarkMode 
                  ? 'bg-white/5 hover:bg-white/10 text-yellow-400' 
                  : 'bg-slate-900/10 hover:bg-slate-900/20 text-orange-500'
              }`}
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            
            {user ? (
              <>
                <div className={`flex items-center gap-2 px-4 py-2 backdrop-blur-xl rounded-full border ${
                  isDarkMode ? 'bg-white/5 border-white/10' : 'bg-slate-900/5 border-slate-900/10'
                }`}>
                  <User className={`w-4 h-4 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                  <span className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{user.email?.split('@')[0]}</span>
                </div>
                <button 
                  onClick={() => supabase.auth.signOut()} 
                  className={`p-2 rounded-full transition-all group ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-900/10'}`}
                  title="Sign Out"
                >
                  <LogOut className={`w-5 h-5 transition-colors ${isDarkMode ? 'text-slate-400 group-hover:text-rose-400' : 'text-slate-500 group-hover:text-rose-500'}`} />
                </button>
              </>
            ) : null}
          </div>
        </header>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="relative group">
            <div className={`absolute inset-0 bg-linear-to-r from-emerald-500/20 to-teal-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity`} />
            <div className={`relative p-5 backdrop-blur-xl rounded-2xl border transition-all ${
              isDarkMode 
                ? 'bg-white/5 border-white/10 hover:border-emerald-500/30' 
                : 'bg-white/60 border-slate-200/60 hover:border-emerald-500/30 shadow-lg shadow-slate-200/50'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Total Credit</span>
                <div className={`p-1.5 rounded-lg ${isDarkMode ? 'bg-emerald-500/20' : 'bg-emerald-500/10'}`}>
                  <TrendingUp className={`w-4 h-4 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                </div>
              </div>
              <p className={`text-2xl font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{formatCurrency(stats.credit)}</p>
            </div>
          </div>

          <div className="relative group">
            <div className={`absolute inset-0 bg-linear-to-r from-rose-500/20 to-pink-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity`} />
            <div className={`relative p-5 backdrop-blur-xl rounded-2xl border transition-all ${
              isDarkMode 
                ? 'bg-white/5 border-white/10 hover:border-rose-500/30' 
                : 'bg-white/60 border-slate-200/60 hover:border-rose-500/30 shadow-lg shadow-slate-200/50'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Total Debit</span>
                <div className={`p-1.5 rounded-lg ${isDarkMode ? 'bg-rose-500/20' : 'bg-rose-500/10'}`}>
                  <TrendingDown className={`w-4 h-4 ${isDarkMode ? 'text-rose-400' : 'text-rose-600'}`} />
                </div>
              </div>
              <p className={`text-2xl font-bold ${isDarkMode ? 'text-rose-400' : 'text-rose-600'}`}>{formatCurrency(stats.debit)}</p>
            </div>
          </div>

          <div className="relative group">
            <div className={`absolute inset-0 bg-linear-to-r from-purple-500/20 to-pink-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity`} />
            <div className={`relative p-5 backdrop-blur-xl rounded-2xl border transition-all ${
              isDarkMode 
                ? 'bg-white/5 border-white/10 hover:border-purple-500/30' 
                : 'bg-white/60 border-slate-200/60 hover:border-purple-500/30 shadow-lg shadow-slate-200/50'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Net Balance</span>
                <div className={`p-1.5 rounded-lg ${isDarkMode ? 'bg-purple-500/20' : 'bg-purple-500/10'}`}>
                  <Wallet className={`w-4 h-4 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                </div>
              </div>
              <p className={`text-2xl font-bold ${stats.credit - stats.debit >= 0 ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-600') : (isDarkMode ? 'text-rose-400' : 'text-rose-600')}`}>
                {formatCurrency(stats.credit - stats.debit)}
              </p>
            </div>
          </div>
        </div>

        {/* Admin Panel */}
        {user && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Plus className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Add Transaction</h2>
              </div>
              <button
                onClick={() => setShowHidden(!showHidden)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  showHidden 
                    ? (isDarkMode ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30' : 'bg-purple-500/20 text-purple-600 hover:bg-purple-500/30')
                    : (isDarkMode ? 'bg-white/5 text-slate-400 hover:bg-white/10' : 'bg-slate-200/50 text-slate-600 hover:bg-slate-200')
                }`}
              >
                {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {showHidden ? 'Showing Hidden' : 'Show Hidden'}
              </button>
            </div>
            <form onSubmit={handleManualSubmit} className={`p-5 backdrop-blur-xl rounded-2xl border shadow-2xl ${
              isDarkMode 
                ? 'bg-white/5 border-white/10' 
                : 'bg-white/70 border-slate-200/60 shadow-slate-200/30'
            }`}>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-4">
                  <label className={`text-xs block mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Description *</label>
                  <input 
                    required 
                    type="text" 
                    value={manualForm.name} 
                    onChange={e => setManualForm({...manualForm, name: e.target.value})} 
                    className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all ${
                      isDarkMode 
                        ? 'bg-black/30 border border-white/10 text-white placeholder:text-slate-600 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20' 
                        : 'bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
                    }`} 
                    placeholder="e.g., Dinner at NIT, Salary, etc." 
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={`text-xs block mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Amount (₹) *</label>
                  <input 
                    required 
                    type="number" 
                    step="0.01"
                    value={manualForm.amount} 
                    onChange={e => setManualForm({...manualForm, amount: e.target.value})} 
                    className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all ${
                      isDarkMode 
                        ? 'bg-black/30 border border-white/10 text-white placeholder:text-slate-600 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20' 
                        : 'bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
                    }`} 
                    placeholder="0.00" 
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={`text-xs block mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Type *</label>
                  <select 
                    value={manualForm.type} 
                    onChange={e => setManualForm({...manualForm, type: e.target.value})} 
                    className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all ${
                      isDarkMode 
                        ? 'bg-black/30 border border-white/10 text-white focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20' 
                        : 'bg-white border border-slate-300 text-slate-900 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
                    }`}
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <label className={`text-xs block mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>UPI ID (blank = CASH)</label>
                  <input 
                    type="text" 
                    value={manualForm.upi_id} 
                    onChange={e => setManualForm({...manualForm, upi_id: e.target.value})} 
                    className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all ${
                      isDarkMode 
                        ? 'bg-black/30 border border-white/10 text-white placeholder:text-slate-600 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20' 
                        : 'bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
                    }`} 
                    placeholder="e.g., account@okaxis or leave blank" 
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className={`text-xs block mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Time (blank = current)</label>
                  <input 
                    type="datetime-local" 
                    value={manualForm.tx_time} 
                    onChange={e => setManualForm({...manualForm, tx_time: e.target.value})} 
                    className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all ${
                      isDarkMode 
                        ? 'bg-black/30 border border-white/10 text-white focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20' 
                        : 'bg-white border border-slate-300 text-slate-900 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
                    }`} 
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className={`text-xs block mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Ref # (blank = auto 10-digit)</label>
                  <input 
                    type="text" 
                    value={manualForm.tx_ref} 
                    onChange={e => setManualForm({...manualForm, tx_ref: e.target.value})} 
                    className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all ${
                      isDarkMode 
                        ? 'bg-black/30 border border-white/10 text-white placeholder:text-slate-600 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20' 
                        : 'bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
                    }`} 
                    placeholder="e.g., 612563323797 or leave blank" 
                  />
                </div>
                <div className="sm:col-span-4 flex items-end">
                  <button 
                    type="submit" 
                    className="w-full py-3 bg-linear-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Transaction
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Transactions List */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Recent Transactions</h2>
            <span className={`text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>{stats.total} total</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <div className={`text-center py-20 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              <Wallet className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? 'opacity-30' : 'opacity-20'}`} />
              <p className={`text-lg ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>No transactions yet</p>
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
                      <form onSubmit={handleUpdate} className={`p-4 backdrop-blur-xl rounded-2xl border shadow-xl ${
                        isDarkMode 
                          ? 'bg-white/10 border-purple-500/30' 
                          : 'bg-white/80 border-purple-500/30 shadow-purple-500/10'
                      }`}>
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-4">
                            <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Description</label>
                            <input 
                              type="text" 
                              value={editForm.name} 
                              onChange={e => setEditForm({...editForm, name: e.target.value})} 
                              className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${
                                isDarkMode 
                                  ? 'bg-black/30 border border-white/10 text-white focus:border-purple-500/50' 
                                  : 'bg-white border border-slate-300 text-slate-900 focus:border-purple-500'
                              }`} 
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Amount</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={editForm.amount} 
                              onChange={e => setEditForm({...editForm, amount: e.target.value})} 
                              className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${
                                isDarkMode 
                                  ? 'bg-black/30 border border-white/10 text-white focus:border-purple-500/50' 
                                  : 'bg-white border border-slate-300 text-slate-900 focus:border-purple-500'
                              }`} 
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Type</label>
                            <select 
                              value={editForm.type} 
                              onChange={e => setEditForm({...editForm, type: e.target.value})} 
                              className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${
                                isDarkMode 
                                  ? 'bg-black/30 border border-white/10 text-white focus:border-purple-500/50' 
                                  : 'bg-white border border-slate-300 text-slate-900 focus:border-purple-500'
                              }`}
                            >
                              <option value="debit">Debit</option>
                              <option value="credit">Credit</option>
                            </select>
                          </div>
                          <div className="sm:col-span-4">
                            <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>UPI ID (blank = CASH)</label>
                            <input 
                              type="text" 
                              value={editForm.upi_id} 
                              onChange={e => setEditForm({...editForm, upi_id: e.target.value})} 
                              className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${
                                isDarkMode 
                                  ? 'bg-black/30 border border-white/10 text-white focus:border-purple-500/50' 
                                  : 'bg-white border border-slate-300 text-slate-900 focus:border-purple-500'
                              }`} 
                            />
                          </div>
                          <div className="sm:col-span-4">
                            <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Time</label>
                            <input 
                              type="datetime-local" 
                              value={editForm.tx_time} 
                              onChange={e => setEditForm({...editForm, tx_time: e.target.value})} 
                              className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${
                                isDarkMode 
                                  ? 'bg-black/30 border border-white/10 text-white focus:border-purple-500/50' 
                                  : 'bg-white border border-slate-300 text-slate-900 focus:border-purple-500'
                              }`} 
                            />
                          </div>
                          <div className="sm:col-span-4">
                            <label className={`text-xs block mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Ref #</label>
                            <input 
                              type="text" 
                              value={editForm.tx_ref} 
                              onChange={e => setEditForm({...editForm, tx_ref: e.target.value})} 
                              className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${
                                isDarkMode 
                                  ? 'bg-black/30 border border-white/10 text-white focus:border-purple-500/50' 
                                  : 'bg-white border border-slate-300 text-slate-900 focus:border-purple-500'
                              }`} 
                            />
                          </div>
                          <div className="sm:col-span-4 flex gap-2 items-end">
                            <button type="submit" className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                              isDarkMode 
                                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400' 
                                : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600'
                            }`}>
                              Save
                            </button>
                            <button 
                              type="button" 
                              onClick={() => setEditingTx(null)} 
                              className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                                isDarkMode 
                                  ? 'bg-white/5 hover:bg-white/10 text-slate-400' 
                                  : 'bg-slate-200 hover:bg-slate-300 text-slate-600'
                              }`}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      <div className={`relative overflow-hidden transition-all duration-300 ${
                        tx.is_hidden 
                          ? 'opacity-50' 
                          : ''
                      }`}>
                        <div className={`relative flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-300 ${
                          tx.is_hidden 
                            ? (isDarkMode ? 'bg-slate-900/60 border-slate-700/60' : 'bg-slate-200/60 border-slate-300/60')
                            : (isDarkMode ? 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600/80' : 'bg-white/70 border-slate-200/80 hover:border-slate-300 shadow-lg shadow-slate-200/30')
                        }`}>
                          {/* Glow effect for non-hidden */}
                          {!tx.is_hidden && isDarkMode && (
                            <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-purple-500/5 to-transparent rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          )}
                        {/* Main row - stack on mobile, side-by-side on desktop */}
                        <div className="flex items-start gap-3">
                          {/* Rank & Icon */}
                          <div className="flex flex-col items-center gap-1.5 shrink-0">
                            <span className={`text-xs font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>#{rankId}</span>
                            <div className={`p-2.5 rounded-xl border ${isCredit 
                              ? (isDarkMode ? 'bg-emerald-500/20 border-emerald-400/30' : 'bg-emerald-500/10 border-emerald-500/20') 
                              : (isDarkMode ? 'bg-rose-500/20 border-rose-400/30' : 'bg-rose-500/10 border-rose-500/20')
                            }`}>
                              {isCredit ? (
                                <ArrowDownRight className={`w-5 h-5 ${isDarkMode ? 'text-emerald-300' : 'text-emerald-600'}`} strokeWidth={2.5} />
                              ) : (
                                <ArrowUpRight className={`w-5 h-5 ${isDarkMode ? 'text-rose-300' : 'text-rose-600'}`} strokeWidth={2.5} />
                              )}
                            </div>
                          </div>

                          {/* Transaction Details - full width, no truncation */}
                          <div className="flex-1 min-w-0">
                            {/* Sender Name */}
                            <div className="flex items-center gap-2 mb-1.5">
                              <h3 className={`text-lg font-bold ${tx.is_hidden 
                                ? (isDarkMode ? 'text-slate-500' : 'text-slate-400') 
                                : (isDarkMode ? 'text-white' : 'text-slate-900')
                              } ${tx.is_hidden ? 'line-through' : ''} ${tx.sender_name.includes(' ') ? '' : 'truncate max-w-[200px] sm:max-w-none sm:whitespace-normal'}`}>
                                {tx.sender_name}
                              </h3>
                              {tx.is_hidden && (
                                <span className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide rounded-full border ${
                                  isDarkMode ? 'bg-purple-500/20 text-purple-300 border-purple-500/20' : 'bg-purple-500/15 text-purple-600 border-purple-500/20'
                                }`}>
                                  HIDDEN
                                </span>
                              )}
                            </div>
                            
                            {/* Meta info row */}
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
                                isDarkMode ? 'bg-slate-700/50 text-slate-300 border-slate-600/50' : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                                <Calendar className={`w-3.5 h-3.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                                {date.day} {date.month}
                              </span>
                              <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
                                isDarkMode ? 'bg-slate-700/50 text-slate-300 border-slate-600/50' : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                                <Clock className={`w-3.5 h-3.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                                {date.time}
                              </span>
                              <span className={`font-mono text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                #{tx.tx_ref?.toUpperCase()}
                              </span>
                            </div>
                          </div>

                          {/* Amount + UPI ID + Actions - right aligned column */}
                          <div className="text-right shrink-0 max-w-[130px] sm:max-w-[180px]">
                            <p className={`text-2xl font-bold ${isCredit ? (isDarkMode ? 'text-emerald-300' : 'text-emerald-600') : (isDarkMode ? 'text-rose-300' : 'text-rose-600')}`}>
                              <span className="whitespace-nowrap">{isCredit ? '+' : '-'} {formatCurrency(tx.amount)}</span>
                            </p>
                            {tx.upi_id === 'CASH' ? (
                              <p className={`text-sm font-medium mt-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Cash</p>
                            ) : (
                              (() => {
                                const atIndex = tx.upi_id.indexOf('@');
                                // Replace hyphens with non-breaking hyphens to prevent line breaks
                                const safeUpi = tx.upi_id.replace(/-/g, '\u2011');
                                if (atIndex > -1 && tx.upi_id.length > 20) {
                                  const safeAtIndex = safeUpi.indexOf('@');
                                  // Split at @ for long UPI IDs on mobile
                                  return (
                                    <p className={`text-sm font-medium mt-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                      <span className="block sm:inline">{safeUpi.slice(0, safeAtIndex)}</span>
                                      <span className={`block sm:inline ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>@{safeUpi.slice(safeAtIndex + 1)}</span>
                                    </p>
                                  );
                                }
                                return <p className={`text-sm font-medium mt-1 sm:whitespace-nowrap ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{safeUpi}</p>;
                              })()
                            )}
                            
                            {/* Actions - below UPI ID */}
                            {user && (
                              <div className={`flex justify-end gap-1.5 mt-2 pt-2 border-t ${isDarkMode ? 'border-white/[0.06]' : 'border-slate-200/60'}`}>
                                <button 
                                  onClick={() => handleEdit(tx)} 
                                  className={`p-1.5 rounded-lg transition-all duration-200 ${
                                    isDarkMode 
                                      ? 'bg-white/[0.05] hover:bg-white/10 border border-white/[0.06] hover:border-white/[0.12]' 
                                      : 'bg-slate-100 hover:bg-slate-200 border border-slate-200 hover:border-slate-300'
                                  }`}
                                  title="Edit"
                                >
                                  <Edit3 className={`w-3.5 h-3.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} />
                                </button>
                                <button 
                                  onClick={() => handleToggleHide(tx)} 
                                  className={`p-1.5 rounded-lg border transition-all duration-200 ${
                                    tx.is_hidden 
                                      ? (isDarkMode ? 'bg-purple-500/15 border-purple-500/25 hover:bg-purple-500/25' : 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20') 
                                      : (isDarkMode ? 'bg-white/[0.05] border-white/[0.06] hover:bg-white/10 hover:border-white/[0.12]' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 hover:border-slate-300')
                                  }`}
                                  title={tx.is_hidden ? 'Unhide' : 'Hide'}
                                >
                                  {tx.is_hidden ? (
                                    <Eye className={`w-3.5 h-3.5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                                  ) : (
                                    <EyeOff className={`w-3.5 h-3.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} />
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
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
          <div className={`flex items-center justify-between pt-6 border-t ${isDarkMode ? 'border-white/5' : 'border-slate-200'}`}>
            <button 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className={`flex items-center gap-2 px-4 py-2 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl transition-all text-sm font-medium ${
                isDarkMode 
                  ? 'bg-white/5 hover:bg-white/10' 
                  : 'bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <ChevronLeft className={`w-4 h-4 ${isDarkMode ? '' : 'text-slate-600'}`} />
              <span className={isDarkMode ? '' : 'text-slate-700'}>Previous</span>
            </button>
            
            <div className="flex items-center gap-1">
              {/* Show 2 pages before and 2 pages after current if available */}
              {Array.from({ length: 5 }, (_, i) => {
                const page = currentPage - 2 + i;
                if (page < 1 || page > totalPages) return null;
                const isCurrent = page === currentPage;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    disabled={isCurrent}
                    className={`w-10 h-10 rounded-xl text-sm font-medium transition-all ${
                      isCurrent
                        ? 'bg-linear-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25'
                        : (isDarkMode ? 'bg-white/5 hover:bg-white/10 text-slate-400' : 'bg-slate-100 hover:bg-slate-200 text-slate-600')
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
              className={`flex items-center gap-2 px-4 py-2 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl transition-all text-sm font-medium ${
                isDarkMode 
                  ? 'bg-white/5 hover:bg-white/10' 
                  : 'bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <span className={isDarkMode ? '' : 'text-slate-700'}>Next</span>
              <ChevronRight className={`w-4 h-4 ${isDarkMode ? '' : 'text-slate-600'}`} />
            </button>
          </div>
        )}
      </div>

      {/* Stealth Login */}
      {!user && isAuthParamPresent && (
        <button 
          onClick={handleLogin} 
          className={`fixed bottom-6 right-6 flex items-center gap-2 px-6 py-3 font-semibold rounded-full shadow-2xl hover:scale-105 transition-all z-50 ${
            isDarkMode 
              ? 'bg-linear-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white shadow-purple-500/30 hover:shadow-purple-500/50' 
              : 'bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-purple-500/40 hover:shadow-purple-500/60'
          }`}
        >
          <User className="w-4 h-4" />
          Admin Login
        </button>
      )}
    </div>
  );
}