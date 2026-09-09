import React, {useRef} from 'react';
import {Paperclip} from 'lucide-react';

export default function DataPicker({onSelect, disabled, compact = false}) {
  const files = useRef(null), folder = useRef(null);
  const choose = async directory => {
    if (window.methodflowDesktop?.chooseData) {
      try {
        const paths = await window.methodflowDesktop.chooseData(directory);
        if (paths.length) onSelect({paths});
      } catch (error) { onSelect({error}); }
    } else (directory ? folder : files).current.click();
  };
  const selected = (event, directory) => {
    const entries = [...event.target.files];
    event.target.value = '';
    if (entries.length) onSelect({files: entries, folder: directory});
  };
  const controls = <span className="dataPicker">
    <button type="button" className={compact ? 'textButton' : 'lightBtn'} disabled={disabled} onClick={() => choose(false)}>{compact ? 'Attach files' : 'Choose files'}</button>
    <button type="button" className={compact ? 'textButton' : 'lightBtn'} disabled={disabled} onClick={() => choose(true)}>{compact ? 'Attach folder' : 'Choose folder'}</button>
    <input ref={files} type="file" multiple hidden onChange={event => selected(event, false)}/>
    <input ref={folder} type="file" multiple webkitdirectory="" hidden onChange={event => selected(event, true)}/>
  </span>;
  return compact ? <details className="attachmentPicker"><summary aria-label="Attach context"><Paperclip size={16}/></summary>{controls}</details> : controls;
}
