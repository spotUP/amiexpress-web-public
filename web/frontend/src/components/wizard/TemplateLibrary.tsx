import { useState } from 'react';
import { GameTemplate } from '../../types/wizard';
import { getCategories } from '../../data/gameTemplates';

interface TemplateLibraryProps {
  templates: GameTemplate[];
  onSelect: (templateId: string) => void;
}

function TemplateLibrary({ templates, onSelect }: TemplateLibraryProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const categories = getCategories();

  // Filter templates
  const filteredTemplates = templates.filter(template => {
    const matchesCategory = !selectedCategory || template.category === selectedCategory;
    const matchesSearch = !searchQuery ||
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some(tag => tag.includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="template-library">
      <div className="library-header">
        <h3>Template Library</h3>
        <p>Choose a pre-built template to get started quickly</p>
      </div>

      <div className="library-filters">
        <input
          type="text"
          className="search-input"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="category-filters">
          <button
            className={`category-btn ${!selectedCategory ? 'active' : ''}`}
            onClick={() => setSelectedCategory(null)}
          >
            All
          </button>
          {categories.map(category => (
            <button
              key={category}
              className={`category-btn ${selectedCategory === category ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="template-grid">
        {filteredTemplates.map(template => (
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
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
            <div className="template-meta">
              <span>{template.metadata.artStyle}</span>
              <span>{template.metadata.difficulty}</span>
              <span>{template.metadata.multiplayer ? 'Multiplayer' : 'Single-player'}</span>
            </div>
          </div>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="no-templates">
          <p>No templates found matching your criteria.</p>
        </div>
      )}
    </div>
  );
}

export default TemplateLibrary;
