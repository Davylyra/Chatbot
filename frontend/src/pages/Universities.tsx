import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiSearch,
  FiMapPin,
  FiUsers,
  FiCalendar,
  FiGrid,
  FiList,
  FiInfo,
  FiX,
  FiExternalLink,
  FiDollarSign,
  FiRefreshCw,
} from "react-icons/fi";
import { LuSparkles } from "react-icons/lu";
import Navbar from "../components/Navbar";
import { useTheme } from "../contexts/ThemeContext";
import { useUniversities } from "../hooks/useUniversities";
import { usePerformance } from "../hooks/usePerformance";
import { UNIVERSITIES_DATA } from "../data/constants";
import LazyImage from "../components/LazyImage";
import { useUniversityChat } from "../hooks/useUniversityChat";

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0 },
};

const Universities: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { startUniversityChat } = useUniversityChat();
  const { universities, isLoading, error, refreshUniversities } = useUniversities();
  const { shouldReduceAnimations } = usePerformance();

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "students" | "established">("name");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedUniversity, setSelectedUniversity] = useState<any | null>(null);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  const getCdnUrl = (path: string) => {
    const cdnBase = import.meta.env.VITE_CDN_URL || "";
    if (!path) return "";
    if (path.startsWith("http") || path.startsWith("data:")) return path;
    return `${cdnBase}${path}`;
  };

  const displayUniversities = useMemo(() => {
    const dataSource =
      universities.length > 0
        ? universities
        : !isLoading
        ? UNIVERSITIES_DATA
        : [];
    return dataSource.map((university: any) => ({
      ...university,
      name: university.name || university.universityName || university.id,
      universityName:
        university.universityName || university.name || university.id,
      type: university.type || "public",
      formPrice: university.formPrice || "₵220",
      isAvailable: university.isAvailable !== false,
    }));
  }, [universities, isLoading]);

  // Statistics
  const stats = useMemo(() => {
    const dataSource = displayUniversities.length > 0 ? displayUniversities : UNIVERSITIES_DATA;
    const total = dataSource.length;
    const publicUnis = dataSource.filter(
      (u) => (u.type || "").toLowerCase() === "public"
    ).length;
    const formsAvailable = dataSource.filter((u) => u.isAvailable !== false).length;
    return { total, publicUnis, formsAvailable };
  }, [displayUniversities]);

  // Filtered & Sorted Universities
  const filteredUniversities = useMemo(() => {
    let result = displayUniversities;

    // Search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (university: any) =>
          university.name.toLowerCase().includes(query) ||
          (university.fullName && university.fullName.toLowerCase().includes(query)) ||
          (university.location && university.location.toLowerCase().includes(query)) ||
          (university.programs &&
            university.programs.some((p: string) => p.toLowerCase().includes(query)))
      );
    }

    // Category pill filter
    if (selectedCategory !== "all") {
      if (selectedCategory === "public") {
        result = result.filter((u) => (u.type || "").toLowerCase() === "public");
      } else if (selectedCategory === "private") {
        result = result.filter((u) => (u.type || "").toLowerCase() === "private");
      } else if (selectedCategory === "stem") {
        result = result.filter((u) =>
          u.programs?.some((p: string) =>
            ["Engineering", "Science", "Energy", "Natural Resources"].includes(p)
          )
        );
      } else if (selectedCategory === "medicine") {
        result = result.filter((u) =>
          u.programs?.some((p: string) => ["Medicine", "Health"].includes(p))
        );
      }
    }

    // Sorting
    return [...result].sort((a: any, b: any) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      } else if (sortBy === "students") {
        const countA = parseInt((a.studentCount || "0").replace(/[^0-9]/g, ""), 10);
        const countB = parseInt((b.studentCount || "0").replace(/[^0-9]/g, ""), 10);
        return countB - countA;
      } else if (sortBy === "established") {
        return (a.established || 2000) - (b.established || 2000);
      }
      return 0;
    });
  }, [displayUniversities, searchQuery, selectedCategory, sortBy]);

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory, sortBy]);

  const paginatedUniversities = useMemo(() => {
    return filteredUniversities.slice(0, page * ITEMS_PER_PAGE);
  }, [filteredUniversities, page]);

  return (
    <div
      className={`min-h-screen transition-colors duration-200 ${
        theme === "dark" ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      <Navbar
        title="EXPLORE UNIVERSITIES"
        showBackButton={true}
        onBackClick={() => navigate("/")}
        showMenuButton={false}
      />

      <div className="w-full max-w-sm mx-auto px-4 py-4 md:max-w-xl md:px-6 md:py-6 lg:max-w-4xl xl:max-w-6xl pb-24">
        
        {/* Header Hero & Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6 text-center md:text-left flex flex-col md:flex-row items-center justify-between gap-4 p-6 rounded-3xl border backdrop-blur-xl shadow-lg bg-white/70 dark:bg-slate-900/70 border-slate-200/80 dark:border-slate-800"
        >
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400 mb-2">
              <LuSparkles className="w-3.5 h-3.5" />
              <span>Higher Education Hub</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Ghana Tertiary Institutions
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
              Explore leading universities, check active admission deadlines, review programs, and interact with AI advisors.
            </p>
          </div>

          {/* Stat Pills */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-center">
              <span className="block text-lg font-black text-primary-600 dark:text-primary-400">
                {stats.total}
              </span>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Institutions
              </span>
            </div>
            <div className="px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-center">
              <span className="block text-lg font-black text-emerald-600 dark:text-emerald-400">
                {stats.formsAvailable}
              </span>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Forms Open
              </span>
            </div>
            <div className="px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-center">
              <span className="block text-lg font-black text-indigo-600 dark:text-indigo-400">
                {stats.publicUnis}
              </span>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Public
              </span>
            </div>
          </div>
        </motion.div>

        {/* Controls Section: Search, Category Pills, Sort & View Mode */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 space-y-4"
        >
          {/* Top Row: Search input + Controls */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <div
                className={`p-3.5 flex items-center space-x-3 rounded-2xl border transition-all duration-200 ${
                  theme === "dark"
                    ? "bg-slate-900/80 border-slate-800 focus-within:border-primary-500"
                    : "bg-white border-slate-200/80 focus-within:border-primary-500 shadow-sm"
                }`}
              >
                <FiSearch className="w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by university name, location, or program..."
                  className="flex-1 bg-transparent outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Sort & View Mode Toggle */}
            <div className="flex items-center space-x-2 shrink-0">
              {/* Sort Dropdown */}
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className={`px-3 py-3.5 rounded-2xl border text-xs font-bold outline-none cursor-pointer transition-all ${
                  theme === "dark"
                    ? "bg-slate-900 border-slate-800 text-white"
                    : "bg-white border-slate-200/80 text-slate-800 shadow-sm"
                }`}
              >
                <option value="name">Sort: Name (A-Z)</option>
                <option value="students">Sort: Students (High-Low)</option>
                <option value="established">Sort: Established Year</option>
              </select>

              {/* View Toggle */}
              <div
                className={`p-1 rounded-2xl border flex items-center space-x-1 ${
                  theme === "dark"
                    ? "bg-slate-900 border-slate-800"
                    : "bg-white border-slate-200/80 shadow-sm"
                }`}
              >
                <button
                  onClick={() => setViewMode("grid")}
                  title="Grid View"
                  className={`p-2 rounded-xl transition-all ${
                    viewMode === "grid"
                      ? "bg-primary-600 text-white shadow-xs"
                      : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  }`}
                >
                  <FiGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  title="List View"
                  className={`p-2 rounded-xl transition-all ${
                    viewMode === "list"
                      ? "bg-primary-600 text-white shadow-xs"
                      : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  }`}
                >
                  <FiList className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Row: Quick Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {[
              { id: "all", label: "All Institutions" },
              { id: "public", label: "Public" },
              { id: "private", label: "Private" },
              { id: "stem", label: "STEM & Tech" },
              { id: "medicine", label: "Medicine & Health" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCategory === cat.id
                    ? "bg-primary-600 text-white shadow-sm shadow-primary-600/30"
                    : theme === "dark"
                    ? "bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Results Counter / Status Indicator */}
        <div className="mb-4 flex items-center justify-between px-1">
          {isLoading ? (
            <div className="flex items-center space-x-2 text-xs font-bold text-primary-600 dark:text-primary-400 animate-pulse">
              <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Fetching institutions data...</span>
            </div>
          ) : (
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Showing{" "}
              <span className="font-extrabold text-slate-900 dark:text-white">
                {filteredUniversities.length}
              </span>{" "}
              {filteredUniversities.length === 1 ? "university" : "universities"}
            </p>
          )}
        </div>

        {/* Error Notification */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-between"
          >
            <span className="text-xs font-medium">{error}</span>
            <button
              onClick={refreshUniversities}
              className="text-xs font-bold underline hover:no-underline"
            >
              Retry
            </button>
          </motion.div>
        )}

        {/* Loading Skeleton View */}
        {isLoading && displayUniversities.length === 0 ? (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                : "space-y-4"
            }
          >
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div
                key={idx}
                className={`rounded-3xl p-5 border animate-pulse flex flex-col justify-between space-y-4 ${
                  theme === "dark"
                    ? "bg-slate-900/60 border-slate-800"
                    : "bg-white border-slate-200/80 shadow-xs"
                }`}
              >
                <div>
                  <div className="flex items-start space-x-3 mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-200 dark:bg-slate-800 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-3/4" />
                      <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-1/2" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 my-3">
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-4/5" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-3/4" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-2/3" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-4/5" />
                  </div>
                  <div className="flex gap-1.5 mt-3">
                    <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded-full w-16" />
                    <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded-full w-20" />
                    <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded-full w-14" />
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex space-x-2">
                  <div className="w-10 h-9 bg-slate-200 dark:bg-slate-800 rounded-xl" />
                  <div className="flex-1 h-9 bg-slate-200 dark:bg-slate-800 rounded-xl" />
                  <div className="w-16 h-9 bg-slate-200 dark:bg-slate-800 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Universities List / Grid Display */
          <motion.div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                : "space-y-4"
            }
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            {paginatedUniversities.map((university: any) => (
              <motion.div
                key={university.id}
                variants={staggerItem}
                whileHover={shouldReduceAnimations ? {} : { y: -3 }}
                transition={{ duration: 0.2 }}
                className={`rounded-3xl p-5 border transition-all duration-200 flex ${
                  viewMode === "grid" ? "flex-col justify-between" : "flex-col sm:flex-row sm:items-center justify-between gap-4"
                } ${
                  theme === "dark"
                    ? "bg-slate-900/80 border-slate-800/80 hover:border-slate-700 shadow-md shadow-slate-950/40"
                    : "bg-white border-slate-200/80 hover:border-primary-500/40 shadow-sm hover:shadow-md"
                }`}
              >
                <div>
                  {/* Header Badge & Logo */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center p-2 shrink-0">
                        <LazyImage
                          src={getCdnUrl(university.logo)}
                          alt={`${university.name} logo`}
                          className="w-10 h-10 object-contain rounded-xl"
                          priority={false}
                          fallback={
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-xs ${
                                university.name === "KNUST"
                                  ? "bg-blue-600"
                                  : university.name === "UG"
                                  ? "bg-emerald-600"
                                  : university.name === "UCC"
                                  ? "bg-cyan-600"
                                  : "bg-primary-600"
                              }`}
                            >
                              {university.universityName || university.name}
                            </div>
                          }
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-extrabold text-base text-slate-900 dark:text-white truncate">
                            {university.universityName || university.name}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                          {university.fullName}
                        </p>
                      </div>
                    </div>

                    {/* Type Badge */}
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
                        (university.type || "").toLowerCase() === "public"
                          ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
                          : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                      }`}
                    >
                      {university.type || "Public"}
                    </span>
                  </div>

                  {/* Details Section */}
                  <div className="grid grid-cols-2 gap-2 my-3 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center space-x-1.5 truncate">
                      <FiMapPin className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                      <span className="truncate">{university.location}</span>
                    </div>
                    <div className="flex items-center space-x-1.5 truncate">
                      <FiUsers className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                      <span>{university.studentCount}</span>
                    </div>
                    <div className="flex items-center space-x-1.5 truncate">
                      <FiCalendar className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                      <span>Est. {university.established}</span>
                    </div>
                    <div className="flex items-center space-x-1.5 truncate">
                      <FiDollarSign className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        Form: {university.formPrice}
                      </span>
                    </div>
                  </div>

                  {/* Programs Chips */}
                  {university.programs && university.programs.length > 0 && (
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-1">
                        {university.programs.slice(0, 3).map((program: string, idx: number) => (
                          <span
                            key={idx}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60"
                          >
                            {program}
                          </span>
                        ))}
                        {university.programs.length > 3 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                            +{university.programs.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedUniversity(university);
                    }}
                    title="Quick View Details"
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  >
                    <FiInfo className="w-4 h-4" />
                  </button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      startUniversityChat({
                        name: university.universityName || university.name,
                        fullName: university.fullName,
                        logo: university.logo,
                      });
                    }}
                    className="flex-1 py-2 px-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center space-x-1.5 shadow-sm shadow-primary-600/20"
                  >
                    <LuSparkles className="w-3.5 h-3.5" />
                    <span>Chat AI</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate("/forms");
                    }}
                    className="py-2 px-3 bg-slate-800 hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center space-x-1"
                  >
                    <span>Forms</span>
                    <FiExternalLink className="w-3 h-3" />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Empty Search State */}
        {!isLoading && filteredUniversities.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16 p-8 rounded-3xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl max-w-md mx-auto my-8"
          >
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
              <FiSearch className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-1">
              No Universities Found
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              We couldn't find any institutions matching "{searchQuery}". Try clearing filters or refining your search.
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
              className="px-5 py-2.5 rounded-xl bg-primary-600 text-white font-bold text-xs shadow-md shadow-primary-600/30 hover:bg-primary-700 transition-colors"
            >
              Reset Filters
            </button>
          </motion.div>
        )}

        {/* Pagination / Load More */}
        {!isLoading && filteredUniversities.length > paginatedUniversities.length && (
          <div className="flex justify-center mt-8">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setPage((p) => p + 1)}
              className="px-8 py-3 rounded-2xl font-extrabold text-xs bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-all shadow-md"
            >
              Load More Institutions
            </motion.button>
          </div>
        )}
      </div>

      {/* Quick View University Modal Dialog */}
      <AnimatePresence>
        {selectedUniversity && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUniversity(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className={`relative w-full max-w-lg rounded-3xl p-6 border shadow-2xl overflow-hidden z-10 ${
                theme === "dark"
                  ? "bg-slate-900 border-slate-800 text-white"
                  : "bg-white border-slate-200 text-slate-900"
              }`}
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedUniversity(null)}
                className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>

              {/* Modal Header */}
              <div className="flex items-start space-x-4 mb-4 pr-8">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center p-2 shrink-0">
                  <LazyImage
                    src={getCdnUrl(selectedUniversity.logo)}
                    alt={`${selectedUniversity.name} logo`}
                    className="w-12 h-12 object-contain rounded-xl"
                    priority={true}
                    fallback={
                      <div className="w-12 h-12 rounded-xl bg-primary-600 text-white font-bold flex items-center justify-center text-sm">
                        {selectedUniversity.name}
                      </div>
                    }
                  />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-black">{selectedUniversity.name}</h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                      {selectedUniversity.type || "Public"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedUniversity.fullName}
                  </p>
                </div>
              </div>

              {/* Description */}
              {selectedUniversity.description && (
                <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 leading-relaxed">
                  {selectedUniversity.description}
                </p>
              )}

              {/* Key Meta Info */}
              <div className="grid grid-cols-2 gap-3 mb-5 text-xs">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Location</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1 mt-0.5">
                    <FiMapPin className="w-3.5 h-3.5 text-primary-500" />
                    {selectedUniversity.location}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Student Count</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1 mt-0.5">
                    <FiUsers className="w-3.5 h-3.5 text-primary-500" />
                    {selectedUniversity.studentCount}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Admission Form</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                    <FiDollarSign className="w-3.5 h-3.5" />
                    {selectedUniversity.formPrice}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Established</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1 mt-0.5">
                    <FiCalendar className="w-3.5 h-3.5 text-primary-500" />
                    {selectedUniversity.established}
                  </span>
                </div>
              </div>

              {/* Programs */}
              {selectedUniversity.programs && (
                <div className="mb-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Available Key Faculties & Programs
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedUniversity.programs.map((prog: string, idx: number) => (
                      <span
                        key={idx}
                        className="text-xs px-3 py-1 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20 font-semibold"
                      >
                        {prog}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                <button
                  onClick={() => {
                    const uni = selectedUniversity;
                    setSelectedUniversity(null);
                    startUniversityChat({
                      name: uni.universityName || uni.name,
                      fullName: uni.fullName,
                      logo: uni.logo,
                    });
                  }}
                  className="flex-1 py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-2xl text-xs transition-colors flex items-center justify-center space-x-2 shadow-md shadow-primary-600/30"
                >
                  <LuSparkles className="w-4 h-4" />
                  <span>Start AI Chat Advisor</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedUniversity(null);
                    navigate("/forms");
                  }}
                  className="py-3 px-4 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-2xl text-xs transition-colors"
                >
                  Buy Form
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Universities;
