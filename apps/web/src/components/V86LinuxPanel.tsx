import { useEffect, useRef, useState } from 'react';
import { V86 } from 'v86';
import wasmUrl from 'v86/build/v86.wasm?url';
import biosUrl from '../assets/vm/seabios.bin?url';
import vgaBiosUrl from '../assets/vm/vgabios.bin?url';
import linuxIsoUrl from '../assets/vm/linux.iso?url';
import RuntimeProgress, { formatDownloadStatus } from './RuntimeProgress';
import styles from './V86LinuxPanel.module.css';

export default function V86LinuxPanel() {
  const screenHost = useRef<HTMLDivElement>(null);
  const emulator = useRef<V86 | null>(null);
  const [status, setStatus] = useState('Preparing the Linux virtual machine…');
  const [error, setError] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | undefined>(undefined);
  const [downloading, setDownloading] = useState(true);

  useEffect(() => {
    const container = screenHost.current;
    if (!container) return;

    let active = true;
    const vm = new V86({
      wasm_path: wasmUrl,
      memory_size: 128 * 1024 * 1024,
      vga_memory_size: 2 * 1024 * 1024,
      bios: { url: biosUrl },
      vga_bios: { url: vgaBiosUrl },
      cdrom: { url: linuxIsoUrl },
      screen: { container, scaling: 1 },
      autostart: true,
      disable_mouse: true,
      disable_speaker: true,
    });
    emulator.current = vm;

    const onProgress = (progress: { file_name: string; loaded: number; total: number; lengthComputable: boolean }) => {
      if (!active) return;
      const known = progress.lengthComputable && progress.total > 0;
      setPercent(known ? Math.floor((progress.loaded / progress.total) * 100) : undefined);
      setStatus(formatDownloadStatus(`Loading ${progress.file_name}`, known ? progress.loaded : 0, known ? progress.total : 0));
    };
    const onStarted = () => { if (active) setDownloading(false);
      if (active) setStatus('Linux is ready. Click the VM screen and start using the shell.'); };
    const onError = (details: { file_name: string }) => {
      if (active) {
        setDownloading(false);
        setError(`Could not load ${details.file_name}. Switch back to the simulated shell and try again later.`);
        setStatus('Linux VM failed to start.');
      }
    };
    vm.add_listener('download-progress', onProgress);
    vm.add_listener('emulator-started', onStarted);
    vm.add_listener('download-error', onError);

    return () => {
      active = false;
      vm.remove_listener('download-progress', onProgress);
      vm.remove_listener('emulator-started', onStarted);
      vm.remove_listener('download-error', onError);
      emulator.current = null;
      void vm.destroy();
    };
  }, []);

  return (
    <div className={styles.panel} aria-label="Linux virtual machine">
      <div ref={screenHost} className={styles.screen} tabIndex={0} aria-label="Linux VM screen" />
      {downloading && !error ? (
        <div className={styles.status}><RuntimeProgress label={status} percent={percent} /></div>
      ) : (
        <p className={`${styles.status} ${error ? styles.error : ''}`} role="status">
          {error ?? status}
        </p>
      )}
    </div>
  );
}
