import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiCheck, FiStar, FiBookOpen, FiTarget } from 'react-icons/fi';
import Navbar from '../components/Navbar';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { assessmentService, type AssessmentQuestion } from '../services/assessmentService';


interface AssessmentData {
  bestSubject: string[];
  shsProgram: string;
  wassceGrade: string;
  interests: string[];
  careerGoals: string;
  preferredLocation: string;
}

const Assessment: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { user, isAuthenticated } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [assessmentData, setAssessmentData] = useState<AssessmentData>({
    bestSubject: [],
    shsProgram: '',
    wassceGrade: '',
    interests: [],
    careerGoals: '',
    preferredLocation: ''
  });

  // Load dynamic assessment questions
  useEffect(() => {
    const loadQuestions = async () => {
      try {
        setLoading(true);
        const dynamicQuestions = await assessmentService.getAssessmentQuestions();
        setQuestions(dynamicQuestions);
      } catch {
        // Failed to load assessment questions - handled gracefully
        // Fallback to empty questions
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    };

    loadQuestions();
  }, []);

  const currentQuestion = questions[currentStep];
  const isLastStep = currentStep === questions.length - 1;
  const isFirstStep = currentStep === 0;

  const handleAnswer = (answer: string | string[]) => {
    setAssessmentData(prev => ({
      ...prev,
      [currentQuestion.id]: answer
    }));
  };

  const handleNext = async () => {
    if (currentStep < questions.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      // Assessment complete - update profile with interests and send data to chat
      console.log(' Assessment completed with data:', assessmentData);
      console.log(' Interests array:', assessmentData.interests);
      console.log(' User authenticated:', isAuthenticated);
      console.log('User object:', user);
      
      try {
        // Update user profile with assessment interests (auto-fill profile page)
        if (isAuthenticated && user && assessmentData.interests?.length > 0) {
          const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
          const token = localStorage.getItem('token');
          
          console.log(' Token exists:', !!token);
          console.log(' Sending interests to backend:', assessmentData.interests);
          
          if (token) {
            try {
              const response = await fetch(`${API_BASE_URL}/profile/update`, {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  interests: assessmentData.interests
                })
              });
              
              const responseData = await response.json();
              
              if (!response.ok) {
                console.error('Failed to update profile:', responseData);
              }
            } catch (error) {
              console.error('Failed to update profile interests:', error);
            }
          }
        }
        
        const chatMessage = await assessmentService.sendAssessmentToChat(assessmentData);
        
        // Navigate to chat with assessment data
        navigate('/chat', { 
          state: { 
            assessmentData,
            initialMessage: chatMessage,
            userContext: {
              is_assessment_result: true,
              assessment_data: assessmentData
            }
          } 
        });
      } catch (error) {
        console.error('Failed to send assessment to chat:', error);
        
        // Update profile even if chat fails
        if (isAuthenticated && user && assessmentData.interests?.length > 0) {
          const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
          const token = localStorage.getItem('token');
          
          if (token) {
            try {
              const response = await fetch(`${API_BASE_URL}/profile/update`, {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  interests: assessmentData.interests
                })
              });
              
              const responseData = await response.json();
              
              if (!response.ok) {
                console.error('Failed to update profile (retry):', responseData);
              }
            } catch (updateError) {
              console.error('Failed to update profile interests:', updateError);
            }
          }
        }
        
        // Fallback: navigate to chat with basic assessment data
        const fallbackMessage = `I just completed my assessment. My strong subjects are ${assessmentData.bestSubject?.join(', ') || 'various subjects'} and I studied ${assessmentData.shsProgram || 'an SHS program'}. I obtained ${assessmentData.wassceGrade || 'good grades'} in WASSCE. I'm interested in ${assessmentData.interests?.join(', ') || 'multiple fields'} and my career goal is to ${assessmentData.careerGoals || 'pursue higher education'}. Could you help me with university recommendations?`;
        
        navigate('/chat', { 
          state: { 
            assessmentData,
            initialMessage: fallbackMessage,
            userContext: {
              is_assessment_result: true,
              assessment_data: assessmentData
            }
          } 
        });
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const isAnswerValid = () => {
    const currentAnswer = assessmentData[currentQuestion.id as keyof AssessmentData];
    if (currentQuestion.type === 'multiple') {
      return Array.isArray(currentAnswer) && currentAnswer.length > 0;
    }
    return currentAnswer && currentAnswer.toString().trim() !== '';
  };

  const getProgressPercentage = () => {
    return questions.length > 0 ? ((currentStep + 1) / questions.length) * 100 : 0;
  };

  // Show loading state while questions are being loaded
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <Navbar 
          title="PROGRAM ASSESSMENT"
          showBackButton={true}
          onBackClick={() => navigate('/')}
          showMenuButton={false}
        />
        
        <div className="w-full max-w-sm mx-auto px-4 py-4 overflow-hidden md:max-w-xl md:px-6 md:py-6 lg:max-w-2xl xl:max-w-3xl">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
              theme === 'dark' ? 'bg-primary-500/20' : 'bg-primary-100'
            }`}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <FiTarget className={`w-10 h-10 ${
                  theme === 'dark' ? 'text-primary-400' : 'text-primary-600'
                }`} />
              </motion.div>
            </div>
            <h2 className={`text-2xl font-bold mb-2 transition-colors duration-200 ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>Loading Assessment</h2>
            <p className={`transition-colors duration-200 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}>Preparing your personalized assessment questions...</p>
          </motion.div>
        </div>
      </div>
    );
  }

  // Show error state if no questions loaded
  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <Navbar 
          title="PROGRAM ASSESSMENT"
          showBackButton={true}
          onBackClick={() => navigate('/')}
          showMenuButton={false}
        />
        
        <div className="w-full max-w-sm mx-auto px-4 py-4 overflow-hidden md:max-w-xl md:px-6 md:py-6 lg:max-w-2xl xl:max-w-3xl">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
              theme === 'dark' ? 'bg-red-500/20' : 'bg-red-100'
            }`}>
              <FiTarget className={`w-10 h-10 ${
                theme === 'dark' ? 'text-red-400' : 'text-red-600'
              }`} />
            </div>
            <h2 className={`text-2xl font-bold mb-2 transition-colors duration-200 ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>Assessment Unavailable</h2>
            <p className={`mb-4 transition-colors duration-200 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}>Unable to load assessment questions. Please try again later.</p>
            <button
              onClick={() => navigate('/')}
              className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors"
            >
              Return Home
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <Navbar 
        title="PROGRAM ASSESSMENT"
        showBackButton={true}
        onBackClick={() => navigate('/')}
        showMenuButton={false}
      />

      <div className="w-full max-w-sm mx-auto px-4 py-4 overflow-hidden md:max-w-xl md:px-6 md:py-6 lg:max-w-2xl xl:max-w-3xl">
        {/* Progress Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium transition-colors duration-200 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Question {currentStep + 1} of {questions.length}
            </span>
            <span className="text-sm font-medium text-primary-600">
              {Math.round(getProgressPercentage())}% Complete
            </span>
          </div>
          <div className={`w-full rounded-full h-2 transition-colors duration-200 ${
            theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
          }`}>
            <motion.div
              className="bg-primary-600 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${getProgressPercentage()}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </motion.div>

        {/* Question Card */}
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className={`p-6 mb-6 ${
            theme === 'dark' ? 'glass-card-unified-dark' : 'glass-card-unified'
          }`}
        >
          <div className="flex items-center mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${
              theme === 'dark' ? 'bg-primary-500/20' : 'bg-primary-100'
            }`}>
              <FiTarget className={`w-5 h-5 ${
                theme === 'dark' ? 'text-primary-400' : 'text-primary-600'
              }`} />
            </div>
            <h2 className={`text-xl font-bold transition-colors duration-200 ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>
              {currentQuestion.question}
            </h2>
          </div>

          {/* Answer Options */}
          <div className="space-y-3">
            {currentQuestion.type === 'text' ? (
              <textarea
                value={assessmentData[currentQuestion.id as keyof AssessmentData] as string || ''}
                onChange={(e) => handleAnswer(e.target.value)}
                placeholder={currentQuestion.placeholder || "Enter your answer..."}
                className={`w-full p-4 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none transition-colors duration-200 ${
                  theme === 'dark' 
                    ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-200 text-gray-900 placeholder-gray-500'
                }`}
                rows={4}
              />
            ) : currentQuestion.options ? (
              currentQuestion.options.map((option, index) => {
                const currentAnswer = assessmentData[currentQuestion.id as keyof AssessmentData];
                const isSelected = currentQuestion.type === 'multiple' 
                  ? Array.isArray(currentAnswer) && currentAnswer.includes(option)
                  : currentAnswer === option;

                return (
                  <motion.button
                    key={index}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (currentQuestion.type === 'multiple') {
                        const currentArray = Array.isArray(currentAnswer) ? currentAnswer : [];
                        const newArray = isSelected
                          ? currentArray.filter(item => item !== option)
                          : [...currentArray, option];
                        handleAnswer(newArray);
                      } else {
                        handleAnswer(option);
                      }
                    }}
                    className={`w-full p-4 text-left rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300'
                        : theme === 'dark'
                          ? 'border-gray-600 bg-gray-700/50 hover:border-gray-500 text-gray-300'
                          : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{option}</span>
                      {isSelected && (
                        <FiCheck className="w-5 h-5 text-primary-600" />
                      )}
                    </div>
                  </motion.button>
                );
              })
            ) : null}
          </div>

          {/* Selection Info for Multiple Choice */}
          {currentQuestion.type === 'multiple' && (
            <div className={`mt-4 p-3 rounded-lg transition-colors duration-200 ${
              theme === 'dark' ? 'bg-blue-500/20' : 'bg-blue-50'
            }`}>
              <p className={`text-sm transition-colors duration-200 ${
                theme === 'dark' ? 'text-blue-300' : 'text-blue-700'
              }`}>
                {currentQuestion.id === 'bestSubject' 
                  ? 'Select all subjects you perform well in'
                  : currentQuestion.id === 'interests'
                  ? 'Select up to 3 career fields that interest you most'
                  : 'Select all that apply'
                }
              </p>
            </div>
          )}
        </motion.div>

        {/* Navigation Buttons */}
        <div className="flex justify-between">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handlePrevious}
            disabled={isFirstStep}
            className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
              isFirstStep
                ? theme === 'dark'
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : theme === 'dark'
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            <FiArrowLeft className="w-4 h-4" />
            <span>Previous</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleNext}
            disabled={!isAnswerValid()}
            className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
              isAnswerValid()
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : theme === 'dark'
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <span>{isLastStep ? 'Send to AI Chat' : 'Next'}</span>
            {!isLastStep && <FiArrowLeft className="w-4 h-4 rotate-180" />}
            {isLastStep && <FiStar className="w-4 h-4" />}
          </motion.button>
        </div>

        {/* Assessment Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-center"
        >
          <div className={`p-4 ${theme === 'dark' ? 'glass-card-unified-dark' : 'glass-card-unified'}`}>
            <div className="flex items-center justify-center space-x-2 mb-2">
              <FiBookOpen className="w-5 h-5 text-primary-600" />
              <h3 className={`font-semibold transition-colors duration-200 ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}>Assessment Benefits</h3>
            </div>
            <p className={`text-sm transition-colors duration-200 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Get personalized program recommendations based on your academic strengths, 
              interests, and career goals. Our AI will match you with the best universities 
              and programs in Ghana.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Assessment;
