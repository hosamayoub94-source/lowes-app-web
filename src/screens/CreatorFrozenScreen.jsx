// =============================================================
// CreatorFrozenScreen — قسم «صناع المحتوى» متوقف مؤقتاً (Window 1: تجميد الواجهة القديمة قبل إغلاق الجدول).
// عمداً بلا أي استيراد من supabase أو creatorWorkbenchSync أو creatorReviewStore: لا قراءة، لا كتابة، لا مزامنة.
// الشاشتان القديمتان (CreatorIntelligenceScreen / CreatorWorkbenchScreen) باقيتان بالملفات بلا تعديل، للرجوع عند الحاجة.
// =============================================================
import { Link } from 'react-router-dom';
import { ROUTES } from '@routes/paths';

export default function CreatorFrozenScreen() {
  return (
    <div className="p-6 max-w-xl mx-auto space-y-4 text-center" dir="rtl">
      <div className="text-4xl">⏸️</div>
      <h1 className="text-lg font-black text-gray-800">قسم صناع المحتوى متوقف مؤقتاً</h1>
      <p className="text-sm text-gray-600 leading-7">
        نقوم حالياً بتحديث نظام تخزين هذا القسم. لا تُدخل ولا تعدّل أي بيانات الآن، وكل ما سُجّل سابقاً محفوظ.
        سنعلمكم عند عودته.
      </p>
      <Link to={ROUTES.SYRIA_LEADS} className="inline-block text-xs font-bold text-blue-600">← ليدز سوريا</Link>
    </div>
  );
}
