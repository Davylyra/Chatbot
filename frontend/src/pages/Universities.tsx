import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiSearch, FiMapPin, FiUsers, FiCalendar } from "react-icons/fi";
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
      staggerChildren: 0.1,
    },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

const Universities: React.FC = () => {
  const navigate = useNavigate();

  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 6;
  const { startUniversityChat } = useUniversityChat();

  const getCdnUrl = (path: string) => {
    const cdnBase = import.meta.env.VITE_CDN_URL || "";
    if (!path) return "";
    if (path.startsWith("http") || path.startsWith("data:")) return path;
    return `${cdnBase}${path}`;
  };

  const { universities, error, refreshUniversities } = useUniversities();

  const { shouldReduceAnimations } = usePerformance();

  const displayUniversities = useMemo(() => {
    const dataSource =
      universities.length > 0 ? universities : UNIVERSITIES_DATA;
    return dataSource.map((university: any) => ({
      ...university,
      name: university.name || university.universityName || university.id,
      universityName:
        university.universityName || university.name || university.id,
    }));
  }, [universities]);

  const filteredUniversities = useMemo(() => {
    if (!searchQuery.trim()) return displayUniversities;

    const query = searchQuery.toLowerCase();
    return displayUniversities.filter(
      (university: any) =>
        university.name.toLowerCase().includes(query) ||
        university.fullName.toLowerCase().includes(query) ||
        university.location.toLowerCase().includes(query),
    );
  }, [displayUniversities, searchQuery]);

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const paginatedUniversities = useMemo(() => {
    return filteredUniversities.slice(0, page * ITEMS_PER_PAGE);
  }, [filteredUniversities, page]);

  return (
    <div
      className={`min-h-screen ${
        theme === "dark"
          ? "bg-gradient-to-b from-transparent via-gray-800/50 to-gray-800"
          : "bg-gradient-to-b from-transparent via-white/50 to-white"
      }`}
    >
      <Navbar
        title="ALL UNIVERSITIES"
        showBackButton={true}
        onBackClick={() => navigate("/")}
        showMenuButton={false}
      />

      <div className="w-full max-w-sm mx-auto px-4 py-4 overflow-hidden md:max-w-xl md:px-6 md:py-6 lg:max-w-2xl xl:max-w-3xl">
        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <div
            className={`p-4 flex items-center space-x-3 transition-all duration-200 ${
              theme === "dark" ? "glass-input-dark" : "glass-input"
            }`}
          >
            <FiSearch
              className={`w-5 h-5 transition-colors duration-200 ${
                theme === "dark" ? "text-gray-400" : "text-gray-500"
              }`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search universities by name or location..."
              className={`flex-1 bg-transparent outline-none transition-colors duration-200 ${
                theme === "dark"
                  ? "text-gray-200 placeholder-gray-400"
                  : "text-gray-700 placeholder-gray-500"
              }`}
            />
          </div>
        </motion.div>

        {/* Results Count */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-4 text-center"
        >
          <p
            className={`transition-colors duration-200 ${
              theme === "dark" ? "text-gray-300" : "text-gray-600"
            }`}
          >
            Showing{" "}
            <span
              className={`font-semibold transition-colors duration-200 ${
                theme === "dark" ? "text-primary-400" : "text-primary-600"
              }`}
            >
              {filteredUniversities.length}
            </span>{" "}
            {filteredUniversities.length === 1 ? "university" : "universities"}
          </p>
        </motion.div>

        {/* App loads instantly - no loading states */}

        {/* Error State */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800"
          >
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-red-700 dark:text-red-300">{error}</span>
              <button
                onClick={refreshUniversities}
                className="ml-auto text-sm text-red-600 dark:text-red-400 hover:underline"
              >
                Retry
              </button>
            </div>
          </motion.div>
        )}

        {/* Universities Grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {paginatedUniversities.map((university: any) => (
            <motion.div
              key={university.id}
              variants={staggerItem}
              whileHover={shouldReduceAnimations ? {} : { y: -2 }}
              whileTap={shouldReduceAnimations ? {} : { y: 0 }}
              className={`p-5 transition-all duration-300 ${
                theme === "dark"
                  ? "glass-card-dark hover:bg-white/10"
                  : "glass-card hover:bg-white/80"
              }`}
            >
              {/* University Header */}
              <div className="flex items-start space-x-4 mb-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center glass-effect flex-shrink-0">
                  <LazyImage
                    src={getCdnUrl(university.logo)}
                    alt={`${university.universityName || university.name} logo`}
                    className="w-12 h-12 rounded-xl"
                    priority={false}
                    fallback={
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white ${
                          university.name === "KNUST"
                            ? "bg-blue-600"
                            : university.name === "UG"
                              ? "bg-green-600"
                              : university.name === "UCC"
                                ? "bg-cyan-500"
                                : university.name === "UDS"
                                  ? "bg-emerald-500"
                                  : university.name === "UENR"
                                    ? "bg-amber-500"
                                    : university.name === "UEW"
                                      ? "bg-purple-500"
                                      : university.universityName === "UMaT"
                                        ? "bg-blue-500"
                                        : university.universityName === "UHA"
                                          ? "bg-emerald-500"
                                          : university.universityName === "GCTU"
                                            ? "bg-pink-500"
                                            : university.universityName ===
                                                "TTU"
                                              ? "bg-orange-500"
                                              : university.universityName ===
                                                  "UPSA"
                                                ? "bg-indigo-500"
                                                : "bg-gray-500"
                        }`}
                      >
                        {university.universityName || university.name}
                      </div>
                    }
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3
                    className={`font-bold text-lg mb-1 transition-colors duration-200 ${
                      theme === "dark" ? "text-white" : "text-gray-800"
                    }`}
                  >
                    {university.universityName || university.name}
                  </h3>
                  <p
                    className={`text-sm line-clamp-2 transition-colors duration-200 ${
                      theme === "dark" ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    {university.fullName}
                  </p>
                </div>
              </div>

              {/* University Details */}
              <div className="space-y-2 mb-4">
                <div
                  className={`flex items-center space-x-2 text-sm transition-colors duration-200 ${
                    theme === "dark" ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  <FiMapPin
                    className={`w-4 h-4 flex-shrink-0 transition-colors duration-200 ${
                      theme === "dark" ? "text-primary-400" : "text-primary-500"
                    }`}
                  />
                  <span>{university.location}</span>
                </div>
                <div
                  className={`flex items-center space-x-2 text-sm transition-colors duration-200 ${
                    theme === "dark" ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  <FiCalendar
                    className={`w-4 h-4 flex-shrink-0 transition-colors duration-200 ${
                      theme === "dark" ? "text-primary-400" : "text-primary-500"
                    }`}
                  />
                  <span>Established {university.established}</span>
                </div>
                <div
                  className={`flex items-center space-x-2 text-sm transition-colors duration-200 ${
                    theme === "dark" ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  <FiUsers
                    className={`w-4 h-4 flex-shrink-0 transition-colors duration-200 ${
                      theme === "dark" ? "text-primary-400" : "text-primary-500"
                    }`}
                  />
                  <span>{university.studentCount} students</span>
                </div>
              </div>

              {/* Programs */}
              <div className="mb-4">
                <p
                  className={`text-xs font-semibold mb-2 transition-colors duration-200 ${
                    theme === "dark" ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  POPULAR PROGRAMS:
                </p>
                <div className="flex flex-wrap gap-1">
                  {university.programs
                    .slice(0, 3)
                    .map((program: string, idx: number) => (
                      <span
                        key={idx}
                        className={`text-xs px-2 py-1 rounded-full transition-colors duration-200 ${
                          theme === "dark"
                            ? "bg-primary-600/20 text-primary-300"
                            : "bg-primary-100 text-primary-700"
                        }`}
                      >
                        {program}
                      </span>
                    ))}
                  {university.programs.length > 3 && (
                    <span
                      className={`text-xs px-2 py-1 rounded-full transition-colors duration-200 ${
                        theme === "dark"
                          ? "bg-gray-700 text-gray-300"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      +{university.programs.length - 3} more
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-2">
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
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-3 rounded-lg transition-colors text-sm"
                >
                  Chat About {university.universityName || university.name}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/forms");
                  }}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-3 rounded-lg transition-colors text-sm"
                >
                  View Forms
                </motion.button>
              </div>
            </motion.div>
          ))}

          {/* No Results */}
          {filteredUniversities.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-12 col-span-full"
            >
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiSearch className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                No universities found
              </h3>
              <p className="text-gray-600">Try adjusting your search terms</p>
            </motion.div>
          )}

          {/* Load More Button */}
          {filteredUniversities.length > paginatedUniversities.length && (
            <div className="col-span-full flex justify-center mt-6">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setPage((p) => p + 1)}
                className={`px-6 py-2 rounded-full font-medium transition-colors ${
                  theme === "dark"
                    ? "bg-gray-700 hover:bg-gray-600 text-white"
                    : "bg-gray-200 hover:bg-gray-300 text-gray-800"
                }`}
              >
                Load More Universities
              </motion.button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Universities;
