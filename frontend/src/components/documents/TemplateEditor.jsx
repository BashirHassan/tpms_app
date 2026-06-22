import { useRef, useEffect } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import PropTypes from 'prop-types';

const FONT_SIZES = '10px 12px 14px 16px 18px 20px 22px 24px 26px 28px 30px 32px 36px 48px';
const LINE_HEIGHTS = '0 0.5 1 1.15 1.5 1.75 2 2.5 3';

const CONTENT_STYLE = `
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 14px;
    line-height: 1.6;
    margin: 1.5rem 2rem;
    color: #111;
  }
  p { margin-bottom: 1em; }
  h1 { font-size: 2em; font-weight: bold; margin-bottom: 0.5em; }
  h2 { font-size: 1.5em; font-weight: bold; margin-bottom: 0.5em; }
  h3 { font-size: 1.25em; font-weight: bold; margin-bottom: 0.5em; }
  h4 { font-size: 1.1em; font-weight: bold; margin-bottom: 0.5em; }
  ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 1em; }
  ol { list-style-type: decimal; padding-left: 1.5em; margin-bottom: 1em; }
  blockquote { border-left: 3px solid #d1d5db; padding-left: 1em; margin-left: 0; margin-bottom: 1em; color: #6b7280; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
  td, th { border: 1px solid #d1d5db; padding: 0.5em 0.75em; }
  th { background: #f9fafb; font-weight: bold; }
  a { color: #2563eb; text-decoration: underline; }
  code { background: #f1f5f9; padding: 0.2em 0.4em; border-radius: 0.25rem; font-size: 0.875em; }
  pre { background: #1e293b; color: #e2e8f0; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1em; }
  pre code { background: none; padding: 0; font-size: inherit; color: inherit; }
`;

const TOOLBAR =
  'undo redo | blocks | fontfamily fontsize lineheight | ' +
  'bold italic underline strikethrough | forecolor backcolor | removeformat | ' +
  'alignleft aligncenter alignright alignjustify | bullist numlist | outdent indent | ' +
  'link image table | code fullscreen';

const PLUGINS = [
  'lists', 'link', 'image', 'code', 'table',
  'searchreplace', 'fullscreen', 'wordcount', 'autolink',
];

const TemplateEditor = ({
  value,
  onChange,
  placeholder = 'Start designing your template...',
  readOnly = false,
  className = '',
  onInsertPlaceholder,
}) => {
  const editorRef = useRef(null);
  // Gate onEditorChange until TinyMCE has fully initialized.
  // Without this, TinyMCE can fire a change event during its own init sequence
  // with empty or partially-parsed content, silently overwriting the parent's
  // editorContent state before the user touches anything.
  const isInitialized = useRef(false);

  useEffect(() => {
    if (onInsertPlaceholder) {
      // Expose as a callable function (insert) with a getContent method alongside it.
      // The parent calls ref.current(text) to insert, and ref.current.getContent() to
      // read the editor's actual HTML at save time — bypassing React state which can
      // be stale if onEditorChange fired with normalised/degraded content during init.
      const fn = (text) => editorRef.current?.insertContent(text);
      fn.getContent = () => editorRef.current?.getContent() ?? '';
      onInsertPlaceholder.current = fn;
    }
  }, [onInsertPlaceholder]);

  return (
    <div className={`template-editor ${className} h-full`}>
      <Editor
        tinymceScriptSrc="/tinymce/tinymce.min.js"
        licenseKey="gpl"
        onInit={(_, editor) => {
          editorRef.current = editor;
          isInitialized.current = true;
        }}
        // Controlled mode: TinyMCE React syncs value → editor internally,
        // but skips setContent when value echoes back our own onEditorChange output
        // (so cursor position is preserved while typing).
        value={value || ''}
        disabled={readOnly}
        onEditorChange={(html) => {
          if (!isInitialized.current) return;
          onChange?.(html);
        }}
        init={{
          height: 750,
          menubar: false,
          placeholder,
          plugins: PLUGINS,
          toolbar: TOOLBAR,
          font_family_formats:
            'Times New Roman=times new roman,times,serif;' +
            'Arial=arial,helvetica,sans-serif;' +
            'Helvetica=helvetica,arial,sans-serif;' +
            'Courier New=courier new,courier,monospace;' +
            'Georgia=georgia,palatino,serif;',
          font_size_formats: FONT_SIZES,
          line_height_formats: LINE_HEIGHTS,
          content_style: CONTENT_STYLE,
          image_advtab: true,
          image_dimensions: true,
          image_uploadtab: false,
          link_default_target: '_blank',
          link_assume_external_targets: true,
          table_responsive_width: true,
          table_default_styles: { 'border-collapse': 'collapse', width: '100%' },
          branding: false,
          promotion: false,
          resize: false,
          statusbar: true,
          elementpath: false,
        }}
      />
    </div>
  );
};

TemplateEditor.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  placeholder: PropTypes.string,
  readOnly: PropTypes.bool,
  className: PropTypes.string,
  onInsertPlaceholder: PropTypes.shape({
    current: PropTypes.func,
  }),
};

export default TemplateEditor;
