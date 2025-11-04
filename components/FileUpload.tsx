import React, { useCallback, useState } from 'react';
import { UploadIcon } from './icons';

interface FileUploadProps {
  onFileUpload: (content: string, fileName: string) => void;
  setAppError: (error: string | null) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, setAppError }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (file && file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (content) {
            onFileUpload(content, file.name);
            setAppError(null);
        } else {
            setAppError("Could not read the file content.");
        }
      };
      reader.onerror = () => {
        setAppError("Error reading file.");
      }
      reader.readAsText(file);
    } else {
      setAppError("Please upload a valid .txt file.");
    }
  }, [onFileUpload, setAppError]);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100">
      <div className="w-full max-w-2xl p-4 sm:p-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">מכינה למבחן תיווך מקרקעין</h1>
        <p className="text-base sm:text-lg text-slate-600 mb-8">העלה את חומר הלימוד שלך (כקובץ .txt) כדי להתחיל.</p>
        <div 
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          className={`relative block w-full rounded-lg border-2 border-dashed bg-white p-8 sm:p-12 text-center transition-colors duration-300 ${isDragging ? 'border-sky-400 bg-sky-50' : 'border-slate-300 hover:border-sky-400'}`}
        >
          <UploadIcon className="mx-auto h-12 w-12 text-slate-400" />
          <span className="mt-2 block text-sm font-semibold text-slate-700">
            גרור ושחרר קובץ .txt
          </span>
          <span className="text-xs text-slate-500">או</span>
          <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-medium text-sky-600 hover:text-sky-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-sky-500 focus-within:ring-offset-2 focus-within:ring-offset-white">
            <span> לחץ לבחירה</span>
            <input id="file-upload" name="file-upload" type="file" accept=".txt" className="sr-only" onChange={handleFileChange} />
          </label>
        </div>
        <p className="mt-4 text-xs text-slate-500">אנא העלה את חומרי הלימוד שלך כקובץ .txt יחיד.</p>
      </div>
    </div>
  );
};

export default FileUpload;