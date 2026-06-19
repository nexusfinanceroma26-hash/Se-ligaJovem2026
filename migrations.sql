-- LIMPEZA (OPCIONAL - use se quiser resetar tudo)
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ===== TABELA DE USUÁRIOS =====
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  company_name VARCHAR(150),
  role VARCHAR(50) DEFAULT 'owner', -- 'owner', 'admin', 'user'
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'suspended'
  email_verified BOOLEAN NOT NULL DEFAULT false,
  email_verified_at TIMESTAMP,
  email_verification_token_hash VARCHAR(255),
  email_verification_expires_at TIMESTAMP,
  password_reset_token_hash VARCHAR(255),
  password_reset_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  
  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- ===== TABELA DE EMPRESAS =====
CREATE TABLE IF NOT EXISTS companies (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  cnpj VARCHAR(20) UNIQUE,
  description TEXT,
  industry VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  logo_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== TABELA DE CLIENTES =====
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  cpf_cnpj VARCHAR(20),
  status VARCHAR(50) DEFAULT 'active',
  total_spent DECIMAL(15, 2) DEFAULT 0,
  purchase_count INTEGER DEFAULT 0,
  last_purchase TIMESTAMP,
  risk_level VARCHAR(50) DEFAULT 'baixo', -- 'baixo', 'médio', 'alto'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== TABELA DE FORNECEDORES =====
CREATE TABLE IF NOT EXISTS suppliers (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  cnpj VARCHAR(20),
  category VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  reliability_score DECIMAL(3, 2) DEFAULT 0, -- 0 a 100
  payment_days INTEGER,
  last_purchase TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== TABELA DE TRANSAÇÕES FINANCEIRAS =====
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'income', 'expense'
  category VARCHAR(100),
  amount DECIMAL(15, 2) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'cancelled'
  transaction_date TIMESTAMP NOT NULL,
  due_date TIMESTAMP,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  supplier_id BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== TABELA DE PRODUTOS/SKUs =====
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  cost DECIMAL(10, 2),
  stock_quantity INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== DADOS DO APP POR USUARIO =====
CREATE TABLE IF NOT EXISTS user_app_data (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== ÍNDICES PARA PERFORMANCE =====
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_email_verified ON users(email_verified);
CREATE INDEX idx_users_email_verification_token_hash ON users(email_verification_token_hash);
CREATE INDEX idx_companies_owner_id ON companies(owner_id);
CREATE INDEX idx_customers_company_id ON customers(company_id);
CREATE INDEX idx_suppliers_company_id ON suppliers(company_id);
CREATE INDEX idx_transactions_company_id ON transactions(company_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_products_company_id ON products(company_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_user_app_data_updated_at ON user_app_data(updated_at);

-- ===== SEGURANÇA =====
-- Desabilitamos o RLS por enquanto para que seu servidor Node.js 
-- possa gerenciar os dados livremente usando a sua chave API.
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_app_data DISABLE ROW LEVEL SECURITY;

-- Comentário para documentação
COMMENT ON TABLE users IS 'Tabela de usuários do sistema NexFinance';
COMMENT ON TABLE companies IS 'Tabela de empresas/clientes da plataforma';
COMMENT ON TABLE customers IS 'Clientes de cada empresa';
COMMENT ON TABLE suppliers IS 'Fornecedores de cada empresa';
COMMENT ON TABLE transactions IS 'Transações financeiras (receitas e despesas)';
COMMENT ON TABLE products IS 'Produtos/SKUs da empresa';
