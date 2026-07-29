import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiUser,
  FiEdit3,
  FiMail,
  FiMapPin,
  FiCalendar,
  FiShield,
  FiAward,
  FiZap,
  FiShoppingCart,
  FiCheckCircle,
} from "react-icons/fi";
import { LuSparkles } from "react-icons/lu";
import Sidebar from "../components/Sidebar";
import { useSidebarNav } from "../hooks/useSidebarNav";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import ToastContainer from "../components/ToastContainer";
import Navbar from "../components/Navbar";

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { isDesktop, sidebarOpen, toggleSidebar, closeSidebar } = useSidebarNav();
  const [isEditing, setIsEditing] = useState(false);
  const { user, updateProfile } = useAuth();
  const { toasts, showSuccess, removeToast } = useToast();
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    location: "",
    bio: "",
    interests: [] as string[],
    preferredUniversities: [] as string[],
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
        const token = localStorage.getItem("token");

        if (!token) {
          setIsLoading(false);
          return;
        }

        const response = await fetch(`${API_BASE_URL}/profile/me`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const profilePayload = await response.json();
        if (profilePayload.success && profilePayload.user) {
          setProfileData(profilePayload.user);
          setFormData({
            name: profilePayload.user.name || "",
            email: profilePayload.user.email || "",
            location: profilePayload.user.location || "",
            bio: profilePayload.user.bio || "",
            interests: profilePayload.user.interests || [],
            preferredUniversities:
              profilePayload.user.preferredUniversities || [],
          });
          updateProfile({
            name: profilePayload.user.name,
            email: profilePayload.user.email,
            createdAt: profilePayload.user.createdAt,
            assessmentCompleted: profilePayload.user.stats?.assessmentCount > 0,
          });
        }
      } catch (error) {
        console.error("Failed to fetch profile:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [refreshTrigger]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && !isLoading) {
        setRefreshTrigger((prev) => prev + 1);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLoading]);

  useEffect(() => {
    if (user && !profileData) {
      setFormData({
        name: user.name || "",
        email: user.email || "",
        location: "",
        bio: "",
        interests: [],
        preferredUniversities: [],
      });
    }
  }, [user, profileData]);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email is invalid";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
      const token = localStorage.getItem("token");

      if (!token) {
        setErrors({ submit: "Please log in to update your profile" });
        setIsSaving(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/profile/update`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          location: formData.location,
          bio: formData.bio,
        }),
      });

      const updatePayload = await response.json();

      if (!response.ok) {
        throw new Error(updatePayload.message || "Failed to update profile");
      }

      if (updatePayload.success) {
        setProfileData(updatePayload.user);

        setFormData({
          name: updatePayload.user.name || "",
          email: updatePayload.user.email || "",
          location: updatePayload.user.location || "",
          bio: updatePayload.user.bio || "",
          interests: updatePayload.user.interests || formData.interests,
          preferredUniversities:
            updatePayload.user.preferredUniversities ||
            formData.preferredUniversities,
        });

        updateProfile({
          name: updatePayload.user.name,
          email: updatePayload.user.email,
          createdAt: updatePayload.user.createdAt,
        });

        const storedUser = localStorage.getItem("user");
        if (storedUser) {
          const userData = JSON.parse(storedUser);
          userData.name = updatePayload.user.name;
          userData.email = updatePayload.user.email;
          localStorage.setItem("user", JSON.stringify(userData));
        }

        setIsEditing(false);
        setErrors({});

        showSuccess(
          "Profile Updated",
          "Your profile has been saved successfully",
          3000,
        );
      }
    } catch (error: any) {
      console.error("Profile update error:", error);
      setErrors({ submit: error.message || "Failed to update profile" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setErrors({});

    if (profileData) {
      setFormData({
        name: profileData.name || "",
        email: profileData.email || "",
        location: profileData.location || "",
        bio: profileData.bio || "",
        interests: profileData.interests || [],
        preferredUniversities: profileData.preferredUniversities || [],
      });
    } else if (user) {
      setFormData({
        name: user.name || "",
        email: user.email || "",
        location: "",
        bio: "",
        interests: [],
        preferredUniversities: [],
      });
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        isDesktop={isDesktop}
      />
      <div
        className={`flex-1 flex flex-col h-full overflow-y-auto transition-colors duration-200 ${
          theme === "dark"
            ? "bg-slate-950 text-white"
            : "bg-slate-50 text-slate-900"
        }`}
      >
        <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
        <Navbar
          title="PROFILE OVERVIEW"
          showBackButton={true}
          onBackClick={() => navigate("/")}
          showMenuButton={true}
          onMenuClick={toggleSidebar}
        />

        <div className="w-full max-w-sm mx-auto px-4 py-6 md:max-w-xl md:px-6 md:py-8 lg:max-w-2xl xl:max-w-3xl pb-24 space-y-6">
          {/* Profile Header Hero Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`relative rounded-3xl p-6 md:p-8 border shadow-xl backdrop-blur-xl overflow-hidden transition-all ${
              theme === "dark"
                ? "bg-slate-900/80 border-slate-800 shadow-slate-950/50"
                : "bg-white/80 border-slate-200/80 shadow-slate-200/50"
            }`}
          >


            <div className="relative flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6 text-center sm:text-left">
              {/* Avatar Circle */}
              <div className="relative shrink-0">
                <div className="w-24 h-24 rounded-2xl bg-primary-600 flex items-center justify-center text-white font-extrabold text-3xl shadow-lg shadow-primary-600/30 border-2 border-white/20">
                  {(formData.name || user?.name || "U").charAt(0).toUpperCase()}
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full border-4 border-white dark:border-slate-900 flex items-center justify-center shadow-xs">
                  <FiCheckCircle className="w-3.5 h-3.5 text-white" />
                </div>
              </div>

              {/* User Info Details */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    {isEditing ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                          }
                          className={`w-full bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border font-bold text-lg outline-none transition-all ${
                            errors.name
                              ? "border-red-500"
                              : "border-primary-500/50 focus:border-primary-500"
                          }`}
                          placeholder="Your Full Name"
                        />
                        {errors.name && (
                          <p className="text-red-500 text-xs font-semibold">
                            {errors.name}
                          </p>
                        )}
                      </div>
                    ) : (
                      <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white truncate">
                        {user?.name || "Student User"}
                      </h2>
                    )}
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {user?.email || "student@example.com"}
                    </p>
                  </div>

                  {/* Toggle Edit Button */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsEditing(!isEditing)}
                    className={`inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs border ${
                      isEditing
                        ? "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700"
                        : "bg-primary-600 hover:bg-primary-700 text-white border-primary-500 shadow-primary-600/20"
                    }`}
                  >
                    <FiEdit3 className="w-4 h-4" />
                    <span>{isEditing ? "Editing..." : "Edit Profile"}</span>
                  </motion.button>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-4">
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <FiShield className="w-3.5 h-3.5" />
                    <span>Verified Student</span>
                  </span>

                  <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    <FiCalendar className="w-3.5 h-3.5" />
                    <span>
                      Joined{" "}
                      {profileData?.createdAt
                        ? new Date(profileData.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            year: "numeric",
                          })
                        : "2025"}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-3 md:gap-4">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className={`rounded-2xl p-4 border backdrop-blur-md text-center transition-all ${
                theme === "dark"
                  ? "bg-slate-900/60 border-slate-800"
                  : "bg-white/70 border-slate-200/80"
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center mb-2">
                <FiAward className="w-5 h-5" />
              </div>
              <p className="text-lg font-black text-slate-900 dark:text-white">
                {profileData?.stats?.assessmentCount || 1}
              </p>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                Assessments
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className={`rounded-2xl p-4 border backdrop-blur-md text-center transition-all ${
                theme === "dark"
                  ? "bg-slate-900/60 border-slate-800"
                  : "bg-white/70 border-slate-200/80"
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 mx-auto flex items-center justify-center mb-2">
                <FiShoppingCart className="w-5 h-5" />
              </div>
              <p className="text-lg font-black text-slate-900 dark:text-white">
                {profileData?.stats?.formsCount || 0}
              </p>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                Forms Bought
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className={`rounded-2xl p-4 border backdrop-blur-md text-center transition-all ${
                theme === "dark"
                  ? "bg-slate-900/60 border-slate-800"
                  : "bg-white/70 border-slate-200/80"
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center mb-2">
                <LuSparkles className="w-5 h-5" />
              </div>
              <p className="text-lg font-black text-slate-900 dark:text-white">
                AI Active
              </p>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                Advisor Mode
              </p>
            </motion.div>
          </div>

          {/* Personal Information Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`rounded-3xl p-6 border backdrop-blur-xl shadow-lg transition-all ${
              theme === "dark"
                ? "bg-slate-900/80 border-slate-800"
                : "bg-white/80 border-slate-200/80"
            }`}
          >
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-5 flex items-center space-x-2">
              <FiUser className="w-5 h-5 text-primary-500" />
              <span>Personal Details</span>
            </h3>

            <div className="space-y-4">
              {/* Email Field */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <div className="relative flex items-center">
                  <FiMail className="absolute left-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    disabled={!isEditing}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                      isEditing
                        ? theme === "dark"
                          ? "bg-slate-800 border-slate-700 text-white focus:border-primary-500"
                          : "bg-slate-50 border-slate-300 text-slate-900 focus:border-primary-500"
                        : theme === "dark"
                          ? "bg-slate-800/40 border-transparent text-slate-300 cursor-not-allowed"
                          : "bg-slate-100/60 border-transparent text-slate-700 cursor-not-allowed"
                    } ${errors.email ? "border-red-500" : ""}`}
                    placeholder="Enter email"
                  />
                </div>
                {errors.email && (
                  <p className="text-red-500 text-xs font-medium mt-1">
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Location Field */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Location / Region
                </label>
                <div className="relative flex items-center">
                  <FiMapPin className="absolute left-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) =>
                      setFormData({ ...formData, location: e.target.value })
                    }
                    disabled={!isEditing}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                      isEditing
                        ? theme === "dark"
                          ? "bg-slate-800 border-slate-700 text-white focus:border-primary-500"
                          : "bg-slate-50 border-slate-300 text-slate-900 focus:border-primary-500"
                        : theme === "dark"
                          ? "bg-slate-800/40 border-transparent text-slate-300 cursor-not-allowed"
                          : "bg-slate-100/60 border-transparent text-slate-700 cursor-not-allowed"
                    }`}
                    placeholder="e.g. Accra, Ghana"
                  />
                </div>
              </div>

              {/* Bio Field */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Bio / Academic Goals
                </label>
                <textarea
                  value={formData.bio}
                  onChange={(e) =>
                    setFormData({ ...formData, bio: e.target.value })
                  }
                  disabled={!isEditing}
                  rows={3}
                  className={`w-full p-3.5 rounded-xl border text-sm font-medium transition-all resize-none ${
                    isEditing
                      ? theme === "dark"
                        ? "bg-slate-800 border-slate-700 text-white focus:border-primary-500"
                        : "bg-slate-50 border-slate-300 text-slate-900 focus:border-primary-500"
                      : theme === "dark"
                        ? "bg-slate-800/40 border-transparent text-slate-300 cursor-not-allowed"
                        : "bg-slate-100/60 border-transparent text-slate-700 cursor-not-allowed"
                  }`}
                  placeholder="Tell us about your educational background & target programs..."
                />
              </div>
            </div>

            {/* Save / Cancel Controls */}
            <AnimatePresence>
              {isEditing && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="pt-4 mt-6 border-t border-slate-200/80 dark:border-slate-800 space-y-3"
                >
                  {errors.submit && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-500 rounded-xl text-xs font-bold">
                      {errors.submit}
                    </div>
                  )}

                  <div className="flex items-center space-x-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleCancel}
                      disabled={isSaving}
                      className={`flex-1 py-2.5 px-4 rounded-xl border font-bold text-xs transition-colors ${
                        theme === "dark"
                          ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                          : "border-slate-300 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      Cancel
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex-1 py-2.5 px-4 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center space-x-2 shadow-md shadow-primary-600/20"
                    >
                      {isSaving ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>Save Changes</span>
                      )}
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Academic Preferences & Interests Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className={`rounded-3xl p-6 border backdrop-blur-xl shadow-lg transition-all ${
              theme === "dark"
                ? "bg-slate-900/80 border-slate-800"
                : "bg-white/80 border-slate-200/80"
            }`}
          >
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-4 flex items-center space-x-2">
              <FiZap className="w-5 h-5 text-amber-500" />
              <span>Academic Interests & Target Universities</span>
            </h3>

            {isLoading ? (
              <div className="text-center py-6">
                <p className="text-xs font-semibold text-slate-400 animate-pulse">
                  Loading preferences...
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Areas of Interest */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Areas of Interest
                  </h4>
                  {profileData?.interests && profileData.interests.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {profileData.interests.map((interest: string, index: number) => (
                        <span
                          key={index}
                          className="px-3 py-1 rounded-full text-xs font-bold bg-primary-50 dark:bg-primary-950/80 text-primary-600 dark:text-primary-300 border border-primary-200/80 dark:border-primary-800"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-slate-400 dark:text-slate-500">
                      Complete an assessment to populate your recommended field interests.
                    </p>
                  )}
                </div>

                {/* Preferred Universities */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Target Universities (Ghana)
                  </h4>
                  {profileData?.preferredUniversities &&
                  profileData.preferredUniversities.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {profileData.preferredUniversities.map((uni: string, index: number) => (
                        <span
                          key={index}
                          className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800"
                        >
                          {uni}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-slate-400 dark:text-slate-500">
                      Take our AI Career Assessment to match target universities (UG, KNUST, UCC, etc.).
                    </p>
                  )}
                </div>

                {/* Action CTA */}
                <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate("/assessment")}
                    className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-md shadow-primary-600/20"
                  >
                    <FiZap className="w-4 h-4" />
                    <span>Take / Update AI Assessment</span>
                  </motion.button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
