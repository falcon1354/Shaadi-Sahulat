import React from 'react';

const STAGE_INFO = {
  stage1: {
    label: 'Stage 1: Safety Check',
    icon: '🛡️',
    description: 'Checking for appropriate content...',
    passText: 'Image is safe and appropriate',
    failText: 'Inappropriate or irrelevant content detected',
  },
  stage2: {
    label: 'Stage 2: Category Detection',
    icon: '🏷️',
    description: 'Identifying dress category...',
    passText: null, // Dynamic based on result
    failText: 'Could not identify as a supported dress type',
  },
  stage3: {
    label: 'Stage 3: Similarity Search',
    icon: '🔍',
    description: 'Finding visually similar dresses...',
    passText: 'Similar dresses found!',
    failText: 'Search failed',
  },
};

export default function PipelineStatus({ stages, result, error }) {
  const getStage2PassText = () => {
    if (result?.validation?.predicted_category) {
      const cat = result.validation.predicted_category.replace(/_/g, ' ');
      const conf = (result.validation.confidence * 100).toFixed(1);
      return `Identified as ${cat} (${conf}% confidence)`;
    }
    return 'Dress category identified';
  };

  const allPending = stages.stage1 === 'pending' && stages.stage2 === 'pending' && stages.stage3 === 'pending';

  if (allPending) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-primary-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">🔄 3-Stage Pipeline</h3>
        <div className="flex items-center justify-between gap-2">
          {Object.entries(STAGE_INFO).map(([key, info]) => (
            <React.Fragment key={key}>
              <div className="flex flex-col items-center text-center flex-1">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-xl mb-2">
                  {info.icon}
                </div>
                <span className="text-xs text-gray-400 font-medium">{info.label}</span>
              </div>
              {key !== 'stage3' && (
                <div className="w-8 h-0.5 bg-gray-200 mt-[-20px]" />
              )}
            </React.Fragment>
          ))}
        </div>
        <p className="text-center text-xs text-gray-400 mt-4">
          Upload an image to start the pipeline
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-primary-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">🔄 3-Stage Validation Pipeline</h3>

      <div className="flex items-center gap-2 mb-4">
        {Object.entries(STAGE_INFO).map(([key, info]) => (
          <React.Fragment key={key}>
            <div className="flex flex-col items-center text-center flex-1">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl mb-2 pipeline-stage ${stages[key]} transition-all`}>
                {stages[key] === 'active' ? (
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : stages[key] === 'passed' ? '✓' : stages[key] === 'failed' ? '✗' : info.icon}
              </div>
              <span className="text-xs font-medium text-gray-600">{info.label}</span>
              {stages[key] === 'passed' && (
                <span className="text-[10px] text-green-600 mt-0.5">
                  {key === 'stage2' ? getStage2PassText() : info.passText}
                </span>
              )}
              {stages[key] === 'failed' && (
                <span className="text-[10px] text-red-500 mt-0.5">{info.failText}</span>
              )}
              {stages[key] === 'active' && (
                <span className="text-[10px] text-primary-900 mt-0.5">{info.description}</span>
              )}
            </div>
            {key !== 'stage3' && (
              <div className={`w-8 h-0.5 mt-[-20px] transition-colors ${
                (stages[key] === 'passed' && (stages[key === 'stage1' ? 'stage2' : 'stage3'] !== 'pending'))
                  ? 'bg-green-400'
                  : 'bg-gray-200'
              }`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Confidence Bar */}
      {result?.validation && (
        <div className="bg-primary-50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-primary-950">
              Predicted: {result.validation.predicted_category?.replace(/_/g, ' ')}
            </span>
            <span className="text-xs font-bold text-primary-950">
              {(result.validation.confidence * 100).toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-primary-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-primary-500 to-primary-800 h-2 rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(result.validation.confidence * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
