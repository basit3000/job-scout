import { currentCvTemplate } from './cv-template-context.mjs';

export function cvTemplateCss(template = currentCvTemplate()) {
  if (!template?.layout) return '';
  const l = template.layout;
  return `/* Selected CV formatting profile */
@page { size: ${l.widthMm}mm ${l.heightMm}mm; margin: ${l.marginTopMm}mm ${l.marginRightMm}mm ${l.marginBottomMm}mm ${l.marginLeftMm}mm; }
body { font-family: "${l.font}", Arial, sans-serif; font-size: ${l.bodyPt}pt; line-height: ${l.lineHeight}; color: #${l.color}; }
h1 { font-size: ${l.namePt}pt; text-align: ${l.headerAlign}; letter-spacing: normal; }
.contact { font-size: ${l.contactPt}pt; text-align: ${l.headerAlign}; color: inherit; }
.headline, .notes { text-align: ${l.headerAlign}; font-size: ${l.bodyPt}pt; color: inherit; }
h2 { font-size: ${l.headingPt}pt; text-transform: ${l.headingUppercase ? 'uppercase' : 'none'}; letter-spacing: normal; border-bottom: ${l.headingRule ? '0.5pt solid currentColor' : 'none'}; margin: ${l.sectionBeforePt}pt 0 3pt; break-after: avoid; }
.sub, .dates { font-size: ${l.bodyPt}pt; color: inherit; }
.entry-head { break-after: avoid; }
.entry-head .dates { margin-left: auto; font-style: normal; font-weight: normal; }
p.sub, li { margin-top: 0; margin-bottom: ${l.paragraphAfterPt}pt; }
ul { padding-left: ${l.bulletIndentPt}pt; }
@media print { body { font-size: ${l.bodyPt}pt; line-height: ${l.lineHeight}; } h2 { margin: ${l.sectionBeforePt}pt 0 3pt; } }
`;
}
