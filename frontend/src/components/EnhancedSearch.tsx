/**
 * Enhanced Search Component
 * Description: Advanced search component with suggestions and filters
 * Integration: Used throughout the app for better search experience
 */

import React, { useState, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiX, FiFilter } from 'react-icons/fi';
import { useGlobalSearch } from '../hooks/useGlobalSearch';

interface EnhancedSearchProps {
  data: any[];
  searchFields: string[];
  placeholder?: string;
  onResultSelect?: (result: any) => void;
  onSearch?: (query: string) => void;
  showSuggestions?: boolean;
  showFilters?: boolean;
  theme?: 'light' | 'dark';
  className?: string;
}

const EnhancedSearch: React.FC<EnhancedSearchProps> = memo(({
  data,
  searchFields,
  placeholder = "Search...",
  onResultSelect,
  onSearch,
  showSuggestions = true,
  showFilters = false,
  theme = 'light',
  className = ''
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const {
    query,
    setQuery,
    results,
    isSearching,
    hasResults,
    clearSearch
  } = useGlobalSearch({
    data,
    searchFields,
    resultLimit: 8
  });

  useEffect(() => {
    if (onSearch) {
      onSearch(query);
    }
  }, [query, onSearch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setShowResults(true);
  };

  const handleResultClick = (result: any) => {
    if (onResultSelect) {
      onResultSelect(result.data);
    }
    setShowResults(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    clearSearch();
    setShowResults(false);
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (query && hasResults) {
      setShowResults(true);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Delay hiding results to allow clicking on them
    setTimeout(() => setShowResults(false), 200);
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'university':
        return '🏫';
      case 'form':
        return '📋';
      case 'program':
        return '🎓';
      default:
        return '🔍';
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className={`relative flex items-center space-x-3 p-4 rounded-2xl border transition-all duration-200 ${
        theme === 'dark' 
          ? 'bg-white/5 border-white/10' 
          : 'bg-white/70 border-white/20'
      } ${isFocused ? 'ring-2 ring-primary-500/50' : ''}`}>
        <FiSearch className={`w-5 h-5 transition-colors duration-200 ${
          theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
        }`} />
        
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={`flex-1 bg-transparent outline-none transition-colors duration-200 ${
            theme === 'dark' 
              ? 'text-gray-200 placeholder-gray-400' 
              : 'text-gray-700 placeholder-gray-500'
          }`}
        />
        
        {query && (
          <button
            onClick={handleClear}
            className={`p-1 rounded-full transition-colors duration-200 ${
              theme === 'dark' 
                ? 'hover:bg-white/10 text-gray-400' 
                : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <FiX className="w-4 h-4" />
          </button>
        )}
        
        {showFilters && (
          <button className={`p-1 rounded-full transition-colors duration-200 ${
            theme === 'dark' 
              ? 'hover:bg-white/10 text-gray-400' 
              : 'hover:bg-gray-100 text-gray-500'
          }`}>
            <FiFilter className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search Results Dropdown */}
      <AnimatePresence>
        {showResults && showSuggestions && (query.length > 1) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={`absolute top-full left-0 right-0 mt-2 rounded-2xl border shadow-lg z-50 ${
              theme === 'dark' 
                ? 'glass-unified-dark' 
                : 'glass-unified'
            }`}
          >
            {isSearching ? (
              <div className="p-4 text-center">
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className={`text-sm ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Searching...
                  </span>
                </div>
              </div>
            ) : hasResults ? (
              <div className="max-h-80 overflow-y-auto">
                {results.map((result, index) => (
                  <motion.button
                    key={result.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleResultClick(result)}
                    className={`w-full p-4 text-left hover:bg-white/10 transition-colors duration-200 border-b last:border-b-0 ${
                      theme === 'dark' 
                        ? 'border-gray-700' 
                        : 'border-gray-100'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-lg">{getResultIcon(result.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium truncate ${
                          theme === 'dark' ? 'text-white' : 'text-gray-900'
                        }`}>
                          {result.title}
                        </p>
                        {result.description && (
                          <p className={`text-sm truncate ${
                            theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {result.description}
                          </p>
                        )}
                      </div>
                      <div className={`text-xs px-2 py-1 rounded-full ${
                        theme === 'dark' 
                          ? 'bg-gray-700 text-gray-300' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {result.type}
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center">
                <div className="flex items-center justify-center space-x-2">
                  <FiSearch className={`w-4 h-4 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                  <span className={`text-sm ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    No results found
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

EnhancedSearch.displayName = 'EnhancedSearch';

export default EnhancedSearch;
