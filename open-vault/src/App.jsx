import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import './index.css';

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [user, setUser] = useState(null);
  const [cashForm, setCashForm] = useState({ amount: "", name: "", type: "debit" });

  // Stealth Check: Is ?auth=true in the URL?
  const isAuthParamPresent = new URLSearchParams(window.location.search).get('auth') === 'true';

  useEffect(() => {
    fetchTransactions();
    
    // Auth Listener
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchTransactions = async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('tx_time', { ascending: false }); // Fetch newest first for the UI

    if (!error) setTransactions(data);
  };

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  const handleManualCash = async (e) => {
    e.preventDefault();
    const cashData = {
      tx_time: new Date().toISOString(),
      type: cashForm.type,
      amount: parseFloat(cashForm.amount),
      sender_name: cashForm.name,
      upi_id: "CASH",
      tx_ref: `CASH-${Date.now()}` // Unique synthetic key
    };

    const { error } = await supabase.from('transactions').insert([cashData]);
    if (!error) {
      setCashForm({ amount: "", name: "", type: "debit" });
      fetchTransactions();
    }
  };

  const totalTx = transactions.length;

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-12 font-sans antialiased">
      <header className="max-w-3xl mx-auto flex justify-between items-center mb-10 border-b border-gray-800 pb-6">
        <h1 className="text-3xl font-bold tracking-tighter">Open Vault</h1>
        {user && (
          <button onClick={() => supabase.auth.signOut()} className="text-sm text-gray-400 hover:text-white">
            Sign Out
          </button>
        )}
      </header>

      {/* ADMIN PANEL: Manual Cash Entry */}
      {user && (
        <form onSubmit={handleManualCash} className="max-w-3xl mx-auto bg-gray-900 border border-gray-800 p-6 rounded-2xl mb-8 flex gap-4 items-end">
          <div className="flex-1">
            <label className="text-xs text-gray-400 block mb-1">Description</label>
            <input required type="text" value={cashForm.name} onChange={e => setCashForm({...cashForm, name: e.target.value})} className="w-full bg-black border border-gray-700 rounded p-2 text-sm" placeholder="e.g., Dinner at NIT" />
          </div>
          <div className="w-24">
            <label className="text-xs text-gray-400 block mb-1">Amount</label>
            <input required type="number" value={cashForm.amount} onChange={e => setCashForm({...cashForm, amount: e.target.value})} className="w-full bg-black border border-gray-700 rounded p-2 text-sm" placeholder="₹" />
          </div>
          <div className="w-24">
            <label className="text-xs text-gray-400 block mb-1">Type</label>
            <select value={cashForm.type} onChange={e => setCashForm({...cashForm, type: e.target.value})} className="w-full bg-black border border-gray-700 rounded p-2 text-sm">
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
            </select>
          </div>
          <button type="submit" className="bg-white text-black font-bold px-4 py-2 rounded hover:bg-gray-200">Add</button>
        </form>
      )}

      {/* LEDGER UI */}
      <div className="max-w-3xl mx-auto space-y-3">
        {transactions.map((tx, index) => {
          // Dynamic Rank Formula (Total - Current Index)
          const rankId = totalTx - index;
          const isCredit = tx.type === 'credit';

          return (
            <div key={tx.id} className="flex justify-between items-center p-4 bg-gray-900/50 border border-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors">
              <div className="flex items-center gap-4">
                <span className="text-gray-600 font-mono text-sm w-8">#{rankId}</span>
                <div>
                  <p className="font-semibold text-gray-200">{tx.sender_name}</p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    {new Date(tx.tx_time).toLocaleDateString('en-GB')} • {tx.tx_ref?.substring(0,8) || 'CASH'}
                  </p>
                </div>
              </div>
              <p className={`font-mono font-medium ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isCredit ? '+' : '-'} ₹{tx.amount}
              </p>
            </div>
          );
        })}
      </div>

      {/* STEALTH LOGIN BUTTON */}
      {!user && isAuthParamPresent && (
        <button onClick={handleLogin} className="fixed bottom-6 right-6 bg-white text-black px-6 py-3 rounded-full font-bold shadow-lg shadow-white/10">
          Admin Login
        </button>
      )}
    </div>
  );
}