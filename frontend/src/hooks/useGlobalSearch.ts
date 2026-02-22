/**
 * Global Search Hook
 * Description: Provides enhanced search functionality across the app
 * Integration: Used for searching universities, forms, and other content
 */

import { useState, useMemo, useCallback } from 'react';

interface SearchResult {
  id: string;
  title: string;
  description?: string;
  type: 'university' | 'form' | 'program' | 'general';
  data: any;
  matchScore: number;
  matchedFields: string[];
}

interface UseGlobalSearchOptions {
  data: any[];
  searchFields: string[];
  resultLimit?: number;
  minQueryLength?: number;
}

interface UseGlobalSearchReturn {
  query: string;
  setQuery: (query: string) => void;
  results: SearchResult[];
  isSearching: boolean;
  hasResults: boolean;
  clearSearch: () => void;
  search: (query: string) => void;
}

export const useGlobalSearch = ({
  data,
  searchFields,
  resultLimit = 10,
  minQueryLength = 2
}: UseGlobalSearchOptions): UseGlobalSearchReturn => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const results = useMemo(() => {
    if (!query || query.length < minQueryLength) {
      return [];
    }

    setIsSearching(true);
    
    const searchTerm = query.toLowerCase().trim();
    const searchResults: SearchResult[] = [];

    data.forEach((item) => {
      let matchScore = 0;
      const matchedFields: string[] = [];

      searchFields.forEach((field) => {
        const fieldValue = item[field];
        if (fieldValue && typeof fieldValue === 'string') {
          const lowerValue = fieldValue.toLowerCase();
          
          // Exact match gets highest score
          if (lowerValue === searchTerm) {
            matchScore += 100;
            matchedFields.push(field);
          }
          // Starts with gets high score
          else if (lowerValue.startsWith(searchTerm)) {
            matchScore += 80;
            matchedFields.push(field);
          }
          // Contains gets medium score
          else if (lowerValue.includes(searchTerm)) {
            matchScore += 60;
            matchedFields.push(field);
          }
          // Word boundary match gets lower score
          else if (new RegExp(`\\b${searchTerm}`, 'i').test(lowerValue)) {
            matchScore += 40;
            matchedFields.push(field);
          }
        }
      });

      if (matchScore > 0) {
        searchResults.push({
          id: item.id || item.universityName || item.name || Math.random().toString(),
          title: item.universityName || item.name || item.title || 'Unknown',
          description: item.fullName || item.description || '',
          type: item.universityName ? 'university' : item.name ? 'form' : 'general',
          data: item,
          matchScore,
          matchedFields
        });
      }
    });

    // Sort by match score and limit results
    const sortedResults = searchResults
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, resultLimit);

    setIsSearching(false);
    return sortedResults;
  }, [query, data, searchFields, resultLimit, minQueryLength]);

  const clearSearch = useCallback(() => {
    setQuery('');
  }, []);

  const search = useCallback((searchQuery: string) => {
    setQuery(searchQuery);
  }, []);

  return {
    query,
    setQuery,
    results,
    isSearching,
    hasResults: results.length > 0,
    clearSearch,
    search
  };
};
