import { useState } from 'react';
import { AudioTemplate } from '../../types/wizard';
import { audioCategories } from '../../data/audioTemplates';

interface AudioTemplateLibraryProps {
  templates: AudioTemplate[];
  onSelect: (templateId: string) => void;
}

function AudioTemplateLibrary({ templates, onSelect }: AudioTemplateLibraryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filteredTemplates = templates.filter(template => {
    const matchesSearch =
      template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'all' ||
      template.category.toLowerCase() === selectedCategory.toLowerCase();

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="template-library">
      <div className="library-header">
        <h3>Audio Template Library</h3>
        <p>Choose a pre-built audio template to get started quickly</p>
      </div>

      <div className="library-filters">
        <input
          type="text"
          className="search-input"
          placeholder="Search audio templates..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <div className="category-filters">
          {audioCategories.map(category => (
            <button
              key={category}
              className={`category-btn ${selectedCategory === category ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category)}
            >
              {category === 'all' ? 'All Styles' : category}
            </button>
          ))}
        </div>
      </div>

      <div className="template-grid">
        {filteredTemplates.length > 0 ? (
          filteredTemplates.map(template => (
            <div
              key={template.id}
              className="template-card"
              onClick={() => onSelect(template.id)}
            >
              <div className="template-header">
                <h4>{template.name}</h4>
                <span className="template-category">{template.category}</span>
              </div>

              <p className="template-description">{template.description}</p>

              <div className="template-tags">
                {template.tags.map(tag => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>

              <div className="template-meta">
                {template.metadata.musicStyle && (
                  <span>Music: {template.metadata.musicStyle.slice(0, 2).join(', ')}</span>
                )}
                {template.metadata.licensing && (
                  <span>{template.metadata.licensing}</span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="no-templates">
            <p>No audio templates found matching your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AudioTemplateLibrary;
