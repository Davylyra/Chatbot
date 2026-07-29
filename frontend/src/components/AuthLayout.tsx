import React from "react";
import { motion } from "framer-motion";
import { FiCheckCircle, FiShield, FiZap, FiBookOpen } from "react-icons/fi";

interface FeatureHighlight {
  icon: React.ElementType;
  title: string;
  description: string;
}

interface AuthLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  badgeText?: string;
  features?: FeatureHighlight[];
}

const defaultFeatures: FeatureHighlight[] = [
  {
    icon: FiBookOpen,
    title: "100+ Partner Universities",
    description: "Access curated guidance and application insights.",
  },
  {
    icon: FiZap,
    title: "Smart AI Form Assistance",
    description: "Fill assessment forms quickly with intelligent suggestions.",
  },
  {
    icon: FiShield,
    title: "Secure Academic Portal",
    description: "Your data and applications are safe and confidential.",
  },
];

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  title = "Empowering Your Academic Journey",
  subtitle = "Join CERKYL to explore universities, evaluate your profile, and simplify application workflows with AI guidance.",
  badgeText = "CERKYL AI Platform",
  features = defaultFeatures,
}) => {

  return (
    <div className="relative z-20 min-h-screen w-full flex flex-col lg:flex-row bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      {/* Left Side: Image with Solid Tint Overlay & Messaging (Visible on desktop lg+) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 relative overflow-hidden flex-col justify-between p-12 text-white">
        {/* Background Image */}
        <img
          src="/images/auth-banner.jpg"
          alt="University Library"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* Solid Dark Tint Overlay (No Gradients) */}
        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-[2px]" />

        {/* Top Header / Branding */}
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-6">
            <img
              src="/cerkyl-logo.jpeg"
              alt="Cerkyl Logo"
              className="w-11 h-11 rounded-xl object-cover border border-slate-700/80 shadow-md"
            />
            <span className="text-2xl font-bold tracking-tight text-white">
              CERKYL
            </span>
          </div>

          <span className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-semibold bg-primary-600 text-white tracking-wide border border-primary-500/40">
            {badgeText}
          </span>
        </div>

        {/* Middle Content: Title, Subtitle & Highlights */}
        <div className="relative z-10 my-auto py-8">
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-3xl xl:text-4xl font-bold text-white tracking-tight leading-tight mb-4"
          >
            {title}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-base text-slate-200 leading-relaxed mb-8 max-w-lg font-normal"
          >
            {subtitle}
          </motion.p>

          {/* Feature Highlights */}
          <div className="space-y-4">
            {features.map((feature, idx) => {
              const IconComp = feature.icon;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 + idx * 0.1 }}
                  className="flex items-start space-x-3.5 bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl"
                >
                  <div className="p-2 rounded-lg bg-primary-600/30 text-primary-400 mt-0.5">
                    <IconComp className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      {feature.title}
                    </h2>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {feature.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Footer info on left panel */}
        <div className="relative z-10 pt-4 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
          <span>© {new Date().getFullYear()} CERKYL AI. All rights reserved.</span>
          <span className="flex items-center gap-1 text-slate-300">
            <FiCheckCircle className="text-primary-400 w-3.5 h-3.5" /> Trusted by Students
          </span>
        </div>
      </div>

      {/* Right Side: Form Container */}
      <div className="w-full lg:w-1/2 xl:w-7/12 min-h-screen flex flex-col justify-center items-center px-4 py-8 sm:px-8 lg:px-12 xl:px-16 overflow-y-auto">
        {/* Mobile Header Branding (Visible on mobile/tablet screens < lg) */}
        <div className="lg:hidden w-full max-w-md mb-8 text-center flex flex-col items-center">
          <div className="flex items-center space-x-3 mb-3">
            <img
              src="/cerkyl-logo.jpeg"
              alt="Cerkyl Logo"
              className="w-12 h-12 rounded-xl object-cover shadow-sm border border-slate-200 dark:border-slate-800"
            />
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              CERKYL
            </span>
          </div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
            {badgeText}
          </span>
        </div>

        {/* Children Form Container */}
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
