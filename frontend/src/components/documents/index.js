/**
 * Document Components Index
 * Reusable document preview and generation components
 */

export {
  DocumentPreview,
  DocumentContainer,
  DocumentLetterhead,
  DocumentWatermark,
  DocumentFooter,
  DocumentActions,
  DocumentPrintStyles,
  TemplateBodyStyles,
  SignatureBlock,
  DualSignatureBlock,
  BlankLine,
  DateBlock,
  AddressBlock,
  StudentInfoTable,
  OfficialStamp,
  InstructionsList,
  AttentionBox,
} from './DocumentPreview';

export { IntroductionLetter } from './IntroductionLetter';
export { AcceptanceFormDocument } from './AcceptanceFormDocument';
export { PostingLetter } from './PostingLetter';

// Template Management Components
export { default as PlaceholderPicker } from './PlaceholderPicker';
export { default as TemplateEditor } from './TemplateEditor';
export { default as TemplatePreview } from './TemplatePreview';
