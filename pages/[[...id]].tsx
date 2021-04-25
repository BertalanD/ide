import Head from 'next/head';
/// <reference path="../types/react-split-grid.d.ts" />
import Split from 'react-split-grid';
import React, { useRef, useState, useMemo, useEffect, useReducer } from 'react';
import { RunButton } from '../components/RunButton';
import { TabBar } from '../components/TabBar';
import { useRouter } from 'next/router';
import { Output } from '../components/Output';
import { CogIcon } from '@heroicons/react/solid';
import dynamic from 'next/dynamic';
import defaultCode from '../scripts/defaultCode';
import { useFirebaseRef } from '../hooks/useFirebaseRef';
import JudgeResult, { JudgeSuccessResult } from '../types/judge';

const FirepadEditor = dynamic(() => import('../components/FirepadEditor'), {
  ssr: false,
});

function encode(str: string | null) {
  return btoa(unescape(encodeURIComponent(str || '')));
}

function decode(bytes: string | null) {
  const escaped = escape(atob(bytes || ''));
  try {
    return decodeURIComponent(escaped);
  } catch (err) {
    return unescape(escaped);
  }
}

type Language = 'cpp' | 'java' | 'py';

export default function Home(): JSX.Element {
  const router = useRouter();
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const inputEditor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const outputEditor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [result, setResult] = useState<JudgeSuccessResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lang, setLang] = useReducer((prev: Language, next: Language) => {
    window.history.replaceState(
      {},
      '',
      window.location.href.split('?')[0] + '?lang=' + next
    );
    return next;
  }, 'cpp');

  useEffect(() => {
    if (router.isReady) {
      if (
        router.query.lang === 'cpp' ||
        router.query.lang === 'java' ||
        router.query.lang === 'py'
      ) {
        setLang(router.query.lang);
      }
    }
    // we only want to run it once when router is ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const handleRunCode = () => {
    if (!editor.current || !inputEditor.current) {
      // editor is still loading
      return;
    }

    setIsRunning(true);
    setResult(null);
    const data = {
      source_code: encode(editor.current.getValue()),
      language_id: { cpp: 54, java: 62, py: 71 }[lang],
      stdin: encode(inputEditor.current.getValue()),
      compiler_options: '',
      command_line_arguments: '',
      redirect_stderr_to_stdout: false,
    };

    fetch(
      `https://judge0.usaco.guide/submissions?base64_encoded=true&wait=true`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    )
      .then(async resp => {
        const data: JudgeResult = await resp.json();

        if (data.error || !resp.ok) {
          alert(
            'Error: ' +
              (data.error || resp.status + ' - ' + JSON.stringify(data))
          );
        } else {
          data.stdout = decode(data.stdout);
          data.stderr = decode(data.stderr);
          data.compile_output = decode(data.compile_output);
          data.message = decode(data.message);
          setResult(data);
        }
      })
      .catch(e => {
        console.error(e);
      })
      .finally(() => setIsRunning(false));
  };

  const firebaseRef = useFirebaseRef();
  const firebaseRefs = useMemo(
    () => ({
      cpp: firebaseRef?.child(`editor-cpp`),
      java: firebaseRef?.child(`editor-java`),
      py: firebaseRef?.child(`editor-py`),
      input: firebaseRef?.child('input'),
    }),
    [firebaseRef]
  );

  const layoutEditors = () => {
    if (editor.current) editor.current.layout();
    if (inputEditor.current) inputEditor.current.layout();
    if (outputEditor.current) outputEditor.current.layout();
  };

  useEffect(() => {
    function handleResize() {
      layoutEditors();
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="h-full">
      <Head>
        <title>Real-Time IDE</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 bg-[#1E1E1E] flex items-center">
          <button
            type="button"
            className="relative inline-flex items-center px-4 py-2 shadow-sm text-sm font-medium text-gray-200 hover:bg-gray-800 focus:bg-gray-800 focus:outline-none"
            onClick={() => {}}
          >
            <CogIcon
              className="-ml-1 mr-2 h-5 w-5 text-gray-400"
              aria-hidden="true"
            />
            Settings
          </button>
          <RunButton onClick={() => handleRunCode()} isRunning={isRunning} />
        </div>
        <div className="flex-1 min-h-0">
          <Split
            onDragEnd={() => layoutEditors()}
            render={({ getGridProps, getGutterProps }) => (
              <div
                className="grid grid-cols-[1fr,3px,1fr] grid-rows-[1fr,3px,1fr] h-full"
                {...getGridProps()}
              >
                <div className="row-span-full min-w-0 bg-[#1E1E1E] text-gray-200 flex flex-col overflow-hidden">
                  <TabBar
                    tabs={[
                      { label: 'Main.cpp', value: 'cpp' },
                      { label: 'Main.java', value: 'java' },
                      { label: 'Main.py', value: 'py' },
                    ]}
                    activeTab={lang}
                    onTabSelect={tab => setLang(tab.value as Language)}
                  />
                  <div className="flex-1 overflow-hidden">
                    <FirepadEditor
                      theme="vs-dark"
                      language={
                        { cpp: 'cpp', java: 'java', py: 'python' }[lang]
                      }
                      path={lang}
                      options={{
                        minimap: { enabled: false },
                        automaticLayout: false,
                      }}
                      onMount={e => {
                        editor.current = e;
                        setTimeout(() => {
                          e.layout();
                          e.focus();
                        }, 0);
                      }}
                      defaultValue={defaultCode[lang]}
                      firebaseRef={firebaseRefs[lang]}
                    />
                  </div>
                </div>
                <div
                  className="row-span-full col-start-2 cursor-[col-resize] mx-[-6px] group relative z-10"
                  {...getGutterProps('column', 1)}
                >
                  <div className="absolute h-full left-[6px] right-[6px] bg-black group-hover:bg-gray-600 group-active:bg-gray-600 pointer-events-none transition" />
                </div>
                <div className="flex flex-col min-w-0 min-h-0 overflow-hidden">
                  <TabBar
                    tabs={[{ label: 'input', value: 'input' }]}
                    activeTab={'input'}
                  />
                  <div className="flex-1 bg-[#1E1E1E] text-white min-h-0 overflow-hidden">
                    <FirepadEditor
                      theme="vs-dark"
                      language={'plaintext'}
                      saveViewState={false}
                      path="input"
                      options={{
                        minimap: { enabled: false },
                        automaticLayout: false,
                      }}
                      onMount={e => {
                        inputEditor.current = e;
                        setTimeout(() => {
                          e.layout();
                        }, 0);
                      }}
                      defaultValue=""
                      firebaseRef={firebaseRefs.input}
                    />
                  </div>
                </div>
                <div
                  className="cursor-[row-resize] my-[-6px] group relative z-10"
                  {...getGutterProps('row', 1)}
                >
                  <div className="absolute w-full top-[6px] bottom-[6px] bg-black group-hover:bg-gray-600 group-active:bg-gray-600 pointer-events-none transition" />
                </div>
                <div className="flex flex-col min-w-0 min-h-0 overflow-hidden">
                  <Output
                    result={result}
                    onMount={e => {
                      outputEditor.current = e;
                      setTimeout(() => {
                        e.layout();
                      }, 0);
                    }}
                  />
                </div>
              </div>
            )}
          />
        </div>
        <div className="flex-shrink-0 relative text-sm bg-purple-900 text-purple-200 font-medium font-mono">
          <p className="text-center">
            v0.1.0. &copy; Competitive Programming Initiative
          </p>
          {result && (
            <span className="absolute right-0 top-0 bottom-0 pr-4">
              {result.status.description}, {result.time ?? '-'}s,{' '}
              {result.memory ?? '-'}KB
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
