import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import { useAppStore } from '../store';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

const Transactions: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { transactions, loadTransactions } = useAppStore();

  useEffect(() => {
    if (transactions.length === 0 && user?.id) {
      loadTransactions(user.id);
    }
  }, [transactions.length, loadTransactions, user?.id]);

  // Calculate summary statistics
  const totalSpent = transactions
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + parseFloat(t.amount.replace('GHC ', '')), 0);
  
  const completedCount = transactions.filter(t => t.status === 'completed').length;
  const pendingCount = transactions.filter(t => t.status === 'pending').length;
  const failedCount = transactions.filter(t => t.status === 'failed').length;

  return (
    <div className="min-h-screen">
      <Navbar 
        title="TRANSACTIONS"
        showBackButton={true}
        onBackClick={() => navigate('/')}
        showMenuButton={false}
      />

      <div className="max-w-md mx-auto px-4 py-6">
        {/* Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`backdrop-blur-md rounded-2xl p-6 mb-6 border transition-all duration-200 ${
            theme === 'dark' 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white/80 border-white/30'
          }`}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className={`text-sm mb-1 transition-colors duration-200 ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
              }`}>Total Spent</p>
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 rounded-full text-xs transition-colors duration-200 ${
                  theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                }`}>GHC</span>
                <span className={`text-2xl font-bold transition-colors duration-200 ${
                  theme === 'dark' ? 'text-primary-400' : 'text-primary-600'
                }`}>{totalSpent.toFixed(2)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className={`px-3 py-1 rounded-full text-sm font-medium inline-block transition-colors duration-200 ${
                theme === 'dark' 
                  ? 'bg-green-900/50 text-green-300' 
                  : 'bg-green-100 text-green-700'
              }`}>
                {completedCount} Successful
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <span className={`text-2xl font-bold transition-colors duration-200 ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}>{pendingCount}</span>
              <p className={`text-sm transition-colors duration-200 ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
              }`}>Pending</p>
            </div>
            <div>
              <span className={`text-2xl font-bold transition-colors duration-200 ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}>{failedCount}</span>
              <p className={`text-sm transition-colors duration-200 ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
              }`}>Failed</p>
            </div>
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className={`text-lg font-bold mb-4 transition-colors duration-200 ${
            theme === 'dark' ? 'text-white' : 'text-gray-800'
          }`}>Recent Activity</h3>
          
          <div className="space-y-4">
            {transactions.map((transaction, index) => (
              <motion.div
                key={transaction.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className={`backdrop-blur-md rounded-2xl p-4 border transition-all duration-200 ${
                  theme === 'dark' 
                    ? 'bg-white/10 border-white/20' 
                    : 'bg-white/80 border-white/30'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
                    <span className="text-primary-600 font-bold text-lg">
                      {transaction.universityName.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className={`text-sm transition-colors duration-200 ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                        }`}>{transaction.type}</p>
                        <h4 className={`font-semibold transition-colors duration-200 ${
                          theme === 'dark' ? 'text-white' : 'text-gray-800'
                        }`}>{transaction.universityName}</h4>
                        <p className={`text-sm transition-colors duration-200 ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                        }`}>{transaction.fullName}</p>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium transition-colors duration-200 ${
                        transaction.status === 'completed' 
                          ? theme === 'dark' ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-700'
                        : transaction.status === 'pending' 
                          ? theme === 'dark' ? 'bg-yellow-900/50 text-yellow-300' : 'bg-yellow-100 text-yellow-700'
                        : theme === 'dark' ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700'
                      }`}>
                        {transaction.status}
                      </div>
                    </div>
                    
                    <div className={`mt-3 pt-3 border-t transition-colors duration-200 ${
                      theme === 'dark' ? 'border-gray-700' : 'border-gray-100'
                    }`}>
                      <div className="flex items-center justify-between text-sm">
                        <span className={`transition-colors duration-200 ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                        }`}>{transaction.date} • {transaction.time}</span>
                        <div className="flex items-center space-x-2">
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors duration-200 ${
                            theme === 'dark' ? 'bg-gray-600' : 'bg-gray-200'
                          }`}>
                            <span className="text-xs">💳</span>
                          </div>
                          <span className={`transition-colors duration-200 ${
                            theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                          }`}>{transaction.paymentMethod}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Transactions;
