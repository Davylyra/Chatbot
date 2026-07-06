import Tesseract from 'tesseract.js';

export const parseWassceResult = async (
  file: File
): Promise<{ bestSubject: string[]; wassceGrade: string }> => {
  try {
    const {
      data: { text },
    } = await Tesseract.recognize(file, 'eng');
    const lines = text.split('\n').map((l) => l.trim().toLowerCase());

    const formattedResults: string[] = [];

    const parseLineForSubject = (line: string): string | null => {
      if (line.includes('elective') || line.includes('further')) return 'Elective Mathematics';
      if (line.includes('math')) return 'Core Mathematics';
      if (line.includes('english') || line.includes('lang')) return 'English Language';
      if (
        line.includes('integrated') ||
        (line.includes('science') && !line.includes('agric') && !line.includes('computer'))
      )
        return 'Integrated Science';
      if (line.includes('social') || line.includes('soc')) return 'Social Studies';

      if (line.includes('phys')) return 'Physics';
      if (line.includes('chem')) return 'Chemistry';
      if (line.includes('bio')) return 'Biology';

      if (line.includes('econ')) return 'Economics';
      if (line.includes('geog')) return 'Geography';
      if (line.includes('hist')) return 'History';
      if (line.includes('gov') || line.includes('vern')) return 'Government';
      if (line.includes('lit')) return 'Literature in English';
      if (line.includes('french') || line.includes('fren')) return 'French';
      if (
        line.includes('relig') ||
        line.includes('christ') ||
        line.includes('islam') ||
        line.includes('crs') ||
        line.includes('irs') ||
        line.includes('tradition') ||
        line.includes('watr')
      )
        return 'Religious Studies';
      if (line.includes('music')) return 'Music';
      if (line.includes('physical') || line.includes('p.e')) return 'Physical Education';
      if (
        line.includes('twi') ||
        line.includes('fante') ||
        line.includes('ewe') ||
        line.includes('ga') ||
        line.includes('ghanaian') ||
        line.includes('dagbani') ||
        line.includes('dagaare') ||
        line.includes('dangme') ||
        line.includes('nzema') ||
        line.includes('kasem') ||
        line.includes('gonja')
      )
        return 'Ghanaian Language';

      if (line.includes('business') || line.includes('manage') || line.includes('mgt'))
        return 'Business Management';
      if (line.includes('account') || line.includes('financ')) return 'Financial Accounting';
      if (line.includes('cost')) return 'Cost Accounting';
      if (line.includes('typewrit') || line.includes('clerical') || line.includes('office'))
        return 'Clerical/Office Duties';

      if (
        line.includes('agric') ||
        line.includes('husbandry') ||
        line.includes('crop') ||
        line.includes('fish') ||
        line.includes('forest')
      )
        return 'Agricultural Science';
      if (
        line.includes('visual') ||
        line.includes('art') ||
        line.includes('graphic') ||
        line.includes('picture') ||
        line.includes('sculpt') ||
        line.includes('textile') ||
        line.includes('leather') ||
        line.includes('ceramic')
      )
        return 'Visual Arts';
      if (
        line.includes('home') ||
        line.includes('food') ||
        line.includes('cloth') ||
        line.includes('nutrition') ||
        line.includes('living')
      )
        return 'Home Economics';
      if (
        line.includes('build') ||
        line.includes('construct') ||
        line.includes('wood') ||
        line.includes('metal') ||
        line.includes('draw') ||
        line.includes('mechanic') ||
        line.includes('electric') ||
        line.includes('electronic')
      )
        return 'Technical/Engineering';
      if (
        line.includes('ict') ||
        line.includes('1ct') ||
        line.includes('lct') ||
        line.includes('comput') ||
        line.includes('mputer') ||
        line.includes('info') ||
        line.includes('nform')
      )
        return 'ICT / Computer Science';
      return null;
    };

    lines.forEach((line) => {
      const subj = parseLineForSubject(line);
      const gradeMatch = line.match(
        /\b([a-f][1-9]|82|83|41|al|c0|c8|04|05|06|d1|e3|e8|f9|ca|cb|co)\b/i
      );

      if (subj && gradeMatch) {
        let grade = gradeMatch[1].toUpperCase();
        // OCR misreads: map common digit/letter confusions to correct WASSCE grades
        if (grade === '82') grade = 'B2';
        if (grade === '83') grade = 'B3';
        if (grade === '41' || grade === 'AL') grade = 'A1';
        if (grade === 'C0' || grade === 'C8' || grade === '06' || grade === 'CB' || grade === 'CO')
          grade = 'C6';
        if (grade === '04' || grade === 'CA') grade = 'C4';
        if (grade === '05') grade = 'C5';
        if (grade === 'D1') grade = 'D7';

        formattedResults.push(`${subj}: ${grade}`);
      }
    });

    if (formattedResults.length === 0) {
      throw new Error('NO_GRADES_FOUND');
    }

    return {
      bestSubject: [], // intentionally empty — prevents overwriting user's checkbox selections
      wassceGrade: formattedResults.join(', '),
    };
  } catch (ocrError: any) {
    console.error('OCR Error:', ocrError);
    if (ocrError.message === 'NO_GRADES_FOUND') {
      throw ocrError;
    }
    throw new Error('Failed to parse image. Please enter manually.');
  }
};
