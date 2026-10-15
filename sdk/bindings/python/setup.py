"""
Setup script for amiexpress-sdk Python package
"""

from setuptools import setup, find_packages
import os

# Read README
readme_path = os.path.join(os.path.dirname(__file__), "README.md")
if os.path.exists(readme_path):
    with open(readme_path, "r", encoding="utf-8") as f:
        long_description = f.read()
else:
    long_description = "AmiExpress BBS Door SDK - Python Bindings"

setup(
    name="amiexpress-sdk",
    version="1.0.0",
    description="Modern BBS door development with retro aesthetics",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="AmiExpress Team",
    author_email="dev@amiexpress.org",
    url="https://github.com/amiexpress/sdk",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        "websockets>=10.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0",
            "pytest-asyncio>=0.21",
            "black>=23.0",
            "mypy>=1.0",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries",
        "Topic :: Communications :: BBS",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    keywords="bbs door game retro ansi ascii telnet amiga",
    project_urls={
        "Documentation": "https://docs.amiexpress.org",
        "Source": "https://github.com/amiexpress/sdk",
        "Tracker": "https://github.com/amiexpress/sdk/issues",
    },
)
