// =============================================================
// VirtualThreadList — قائمة المحادثات الجانبية، لكن بتقنية "افتراضية"
// (virtualized): بترسم بس الصفوف الظاهرة فعلياً على الشاشة + هامش صغير،
// بدل رسم كل صف بالـDOM دفعة وحدة.
//
// ⚠️ 13 آب 2026: بلاغ مالك مباشر من آيفون حقيقي — "لمن عم انزل لتحت
// لشوف المحادثات القديمة عم يعلق ويصير بطيء". تحقّق حي بالبيانات الفعلية:
// الخط الرئيسي وحده فيه 1,130 محادثة فريدة، خط الحملات 2,129 — كانت
// ThreadListSection (القديمة) ترسم كل هالصفوف كـDOM nodes حقيقية دفعة
// وحدة (كل صف فيه Avatar + عدة أسطر نص + زر حذف)، بلا أي تحديد لعدد
// العناصر المرسومة. سكرول قائمة بـ1000+ صف DOM حقيقي تقيل جداً على أي
// متصفح، وSafari بالآيفون بالذات معروف إنه أضعف بكتير من Chrome بمعالجة
// scroll compositing لقوائم كبيرة — هذا بالضبط سبب "بيعلق لمن ينزل لتحت".
//
// الحل: بدل رسم كل الصفوف، منرسم بس اللي ظاهر بمنطقة العرض (viewport)
// فعلياً + هامش صغير فوق وتحت (overscanCount) — بغض النظر عن طول القائمة
// الحقيقي (10 محادثات أو 2000)، عدد عناصر الـDOM الفعلي يضل ثابت وصغير
// (~15-20 عنصر) لأن react-window بيعيد استخدام نفس عناصر الـDOM ويبدّل
// محتواها بس أثناء السكرول (نفس تقنية أي تطبيق شات حقيقي — واتساب،
// تيليجرام، إلخ).
//
// ⚠️ كل صف صار ارتفاعه ثابت (ROW_HEIGHT) بدل ما يتمدّد حسب المحتوى —
// شرط تقني لـ react-window (لازم يعرف ارتفاع كل عنصر مسبقاً بلا رسمه).
// المحتوى (اسم/رقم/معاينة/مالك) لسا نفسه، بس بمساحة ثابتة — لو صف نادر
// عنده كل الحقول الأربعة ممكن ينقص هامش سفلي بسيط، مقبول جداً مقابل حل
// جمود السكرول الحقيقي.
// =============================================================
import { useRef, useLayoutEffect, useState } from 'react';
import { VariableSizeList } from 'react-window';
import { ThreadListRow } from './ThreadListRow';

const HEADER_HEIGHT = 30;
// 80 بدل 74 — هامش أمان لأسوأ حالة (اسم + رقم + معاينة + سطر مالك، أربعة
// أسطر) بلا ما ينقص أي سطر، بعد تحويل ThreadListRow لارتفاع ثابت تحت.
const ROW_HEIGHT = 80;

function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

// يحوّل الأقسام الثلاثة (محادثات/حملات/تتبّع) لمصفوفة واحدة مسطّحة —
// عنصر "عنوان قسم" ثم عناصر "صف محادثة" تباعاً — عشان react-window يقدر
// يرسمها كقائمة وحدة بارتفاعات متغيّرة (VariableSizeList).
export function buildThreadListItems(sections) {
  const items = [];
  for (const section of sections) {
    if (!section.threads.length) continue;
    items.push({ type: 'header', key: `h-${section.key}`, label: section.label });
    for (const t of section.threads) items.push({ type: 'thread', key: t.phone, thread: t });
  }
  return items;
}

export function VirtualThreadList({
  items, openPhone, nameByPhone, ownerByPhone, isManager, deletingPhone, seenMap, onOpen, onDelete,
}) {
  const [containerRef, { width, height }] = useElementSize();

  const getItemSize = (index) => (items[index].type === 'header' ? HEADER_HEIGHT : ROW_HEIGHT);

  const Row = ({ index, style }) => {
    const item = items[index];
    if (item.type === 'header') {
      return (
        <div style={style} className="px-3 py-1.5 text-[11px] font-bold text-muted bg-border/20 flex items-center">
          {item.label}
        </div>
      );
    }
    const t = item.thread;
    return (
      <div style={style}>
        <ThreadListRow
          thread={t}
          isOpen={t.phone === openPhone}
          name={nameByPhone[t.phone]}
          ownerName={isManager ? ownerByPhone[t.phone]?.owner_name : null}
          isDeleting={deletingPhone === t.phone}
          isSeen={seenMap?.[t.phone] === t.id}
          onOpen={() => onOpen(t.phone)}
          onDelete={(e) => onDelete(t.phone, e)}
        />
      </div>
    );
  };

  return (
    <div ref={containerRef} className="flex-1 min-h-0">
      {width > 0 && height > 0 && (
        <VariableSizeList
          height={height}
          width={width}
          itemCount={items.length}
          itemSize={getItemSize}
          itemKey={(index) => items[index].key}
          overscanCount={6}
        >
          {Row}
        </VariableSizeList>
      )}
    </div>
  );
}

export default VirtualThreadList;
