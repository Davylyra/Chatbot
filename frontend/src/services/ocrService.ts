import Tesseract from 'tesseract.js';

export const parseWassceResult = async (file: File): Promise<{ bestSubject: string[], wassceGrade: string }> => {
  try {
    const { data: { text } } = await Tesseract.recognize(file, 'eng');

    const lines = text.split('\n').map(l => l.trim().toLowerCase());
    const subjects: string[] = [];
    const grades: string[] = [];

    const commonSubjects = ['mathematics', 'english', 'science', 'social', 'physics', 'chemistry', 'biology', 'economics', 'geography', 'history', 'literature', 'business', 'accounting'];
    const gradeRegex = /\b([a-f][1-9])\b/g;

    lines.forEach(line => {
      commonSubjects.forEach(sub => {
        if (line.includes(sub) && !subjects.includes(sub)) {
          subjects.push(sub.charAt(0).toUpperCase() + sub.slice(1));
        }
      });
      const match = line.match(gradeRegex);
      if (match) {
        grades.push(...match.map(g => g.toUpperCase()));
      }
    });

    return { 
      bestSubject: subjects.slice(0, 3), 
      wassceGrade: grades.length > 0 ? grades.join(', ') : '' 
    };
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Failed to parse image. Please enter manually.');
  }
};
