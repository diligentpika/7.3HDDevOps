pipeline {
    agent any
    
    environment {
        NODE_VERSION = '18'
        DOCKER_IMAGE = 'devops-demo-app'
        DOCKER_TAG = "${BUILD_NUMBER}"
        SONAR_PROJECT_KEY = 'devops-pipeline-demo'
        STAGING_PORT = '3001'
        PROD_PORT = '3000'
    }
    
    tools {
        nodejs "${NODE_VERSION}"
        dockerTool 'docker'
    }
    
    stages {
        stage('1. Build') {
            steps {
                echo '🏗️ Starting Build Stage'
                
                // Clean workspace
                cleanWs()
                
                // Checkout code
                checkout scm
                
                // Install dependencies
                sh '''
                    echo "Installing Node.js dependencies..."
                    npm ci
                    echo "Build completed successfully!"
                '''
                
                // Create build artifact
                sh '''
                    echo "Creating build artifact..."
                    tar -czf app-${BUILD_NUMBER}.tar.gz --exclude=node_modules --exclude=.git .
                    ls -la app-${BUILD_NUMBER}.tar.gz
                '''
                
                // Archive artifacts
                archiveArtifacts artifacts: 'app-*.tar.gz', fingerprint: true
            }
            post {
                success {
                    echo 'Build stage completed successfully'
                }
                failure {
                    echo 'Build stage failed'
                }
            }
        }
        
        stage('2. Test') {
            steps {
                echo '🧪 Starting Test Stage'
                
                // Run unit tests with coverage
                sh '''
                    echo "Running unit tests..."
                    npm test -- --coverage --watchAll=false --testResultsProcessor=jest-junit
                '''
                
                // Run integration tests
                sh '''
                    echo "Running integration tests..."
                    npm start &
                    SERVER_PID=$!
                    sleep 5
                    
                    # Test health endpoint
                    curl -f http://localhost:3000/health || exit 1
                    
                    # Clean up
                    kill $SERVER_PID
                '''
            }
            post {
                always {
                    // Publish test results
                    publishTestResults testResultsPattern: 'coverage/junit.xml'
                    publishCoverage adapters: [
                        istanbulCoberturaAdapter('coverage/cobertura-coverage.xml')
                    ], sourceFileResolver: sourceFiles('STORE_LAST_BUILD')
                }
                success {
                    echo 'Test stage completed successfully'
                }
                failure {
                    echo 'Test stage failed'
                }
            }
        }
        
        stage('3. Code Quality') {
            steps {
                echo 'Starting Code Quality Analysis'
                
                // SonarQube analysis
                script {
                    def scannerHome = tool 'SonarQubeScanner'
                    withSonarQubeEnv('SonarQube') {
                        sh """
                            ${scannerHome}/bin/sonar-scanner \\
                            -Dsonar.projectKey=${SONAR_PROJECT_KEY} \\
                            -Dsonar.sources=. \\
                            -Dsonar.exclusions=node_modules/**,coverage/**,tests/** \\
                            -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \\
                            -Dsonar.testExecutionReportPaths=coverage/test-reporter.xml
                        """
                    }
                }
                
                // Quality Gate
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
                
                // ESLint for additional code quality checks
                sh '''
                    echo "Running ESLint..."
                    npx eslint . --ext .js --format json --output-file eslint-report.json || true
                    npx eslint . --ext .js --format checkstyle --output-file eslint-checkstyle.xml || true
                '''
                
                publishCheckStyleResults pattern: 'eslint-checkstyle.xml'
            }
            post {
                always {
                    archiveArtifacts artifacts: 'eslint-report.json', allowEmptyArchive: true
                }
                success {
                    echo 'Code quality analysis passed'
                }
                failure {
                    echo 'Code quality analysis failed'
                }
            }
        }
        
        stage('4. Security') {
            steps {
                echo 'Starting Security Analysis'
                
                // npm audit for dependency vulnerabilities
                sh '''
                    echo "Checking for dependency vulnerabilities..."
                    npm audit --audit-level=high --json > npm-audit.json || true
                    npm audit --audit-level=high || true
                '''
                
                // Snyk security scan
                script {
                    try {
                        sh '''
                            echo "Running Snyk security scan..."
                            npx snyk test --json > snyk-report.json || true
                            npx snyk test || true
                        '''
                    } catch (Exception e) {
                        echo "Snyk scan completed with findings: ${e.message}"
                    }
                }
                
                // OWASP Dependency Check
                dependencyCheck additionalArguments: '--format JSON --format HTML', odcInstallation: 'OWASP-DC'
                dependencyCheckPublisher pattern: 'dependency-check-report.json'
                
                // Bandit for Python files (if any)
                sh '''
                    if find . -name "*.py" -not -path "./node_modules/*" | grep -q .; then
                        echo "Python files found, running Bandit..."
                        pip install bandit
                        bandit -r . -f json -o bandit-report.json || true
                    else
                        echo "No Python files found, skipping Bandit scan"
                    fi
                '''
            }
            post {
                always {
                    archiveArtifacts artifacts: '*-report.json, npm-audit.json', allowEmptyArchive: true
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: '',
                        reportFiles: 'dependency-check-report.html',
                        reportName: 'OWASP Dependency Check Report'
                    ])
                }
                success {
                    echo 'Security analysis completed'
                }
            }
        }
        
        stage('5. Deploy to Staging') {
            steps {
                echo 'Starting Deploy to Staging'
                
                // Build Docker image
                script {
                    def dockerImage = docker.build("${DOCKER_IMAGE}:${DOCKER_TAG}")
                    
                    // Tag as latest
                    sh "docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} ${DOCKER_IMAGE}:latest"
                    
                    // Stop existing staging container
                    sh '''
                        docker stop staging-app || true
                        docker rm staging-app || true
                    '''
                    
                    // Deploy to staging
                    sh """
                        docker run -d \\
                        --name staging-app \\
                        -p ${STAGING_PORT}:3000 \\
                        -e NODE_ENV=staging \\
                        ${DOCKER_IMAGE}:${DOCKER_TAG}
                    """
                    
                    // Health check
                    sh """
                        echo "Waiting for staging deployment..."
                        sleep 10
                        curl -f http://localhost:${STAGING_PORT}/health || exit 1
                        echo "Staging deployment successful!"
                    """
                }
            }
            post {
                success {
                    echo 'Staging deployment successful'
                }
                failure {
                    echo 'Staging deployment failed'
                    sh 'docker logs staging-app || true'
                }
            }
        }
        
        stage('6. Release to Production') {
            when {
                anyOf {
                    branch 'main'
                    branch 'master'
                }
            }
            steps {
                echo 'Starting Production Release'
                
                // Manual approval for production
                input message: 'Deploy to Production?', ok: 'Deploy', 
                      submitterParameter: 'DEPLOYER'
                
                script {
                    // Stop existing production container
                    sh '''
                        docker stop prod-app || true
                        docker rm prod-app || true
                    '''
                    
                    // Deploy to production
                    sh """
                        docker run -d \\
                        --name prod-app \\
                        -p ${PROD_PORT}:3000 \\
                        -e NODE_ENV=production \\
                        --restart unless-stopped \\
                        ${DOCKER_IMAGE}:${DOCKER_TAG}
                    """
                    
                    // Health check
                    sh """
                        echo "Waiting for production deployment..."
                        sleep 10
                        curl -f http://localhost:${PROD_PORT}/health || exit 1
                        echo "Production deployment successful!"
                    """
                    
                    // Create Git tag for release
                    sh """
                        git tag -a v${BUILD_NUMBER} -m "Release version ${BUILD_NUMBER} deployed by ${DEPLOYER}"
                        git push origin v${BUILD_NUMBER} || true
                    """
                }
            }
            post {
                success {
                    echo 'Production deployment successful'
                    slackSend(
                        color: 'good',
                        message: "Production deployment successful! Version: ${BUILD_NUMBER}"
                    )
                }
                failure {
                    echo 'Production deployment failed'
                    sh 'docker logs prod-app || true'
                    slackSend(
                        color: 'danger',
                        message: "Production deployment failed! Build: ${BUILD_NUMBER}"
                    )
                }
            }
        }
        
        stage('7. Monitoring & Alerting') {
            steps {
                echo '📊 Setting up Monitoring & Alerting'
                
                // Deploy monitoring stack (Prometheus + Grafana)
                script {
                    // Create monitoring configuration
                    writeFile file: 'prometheus.yml', text: '''
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'nodejs-app'
    static_configs:
      - targets: ['host.docker.internal:3000']
    metrics_path: '/metrics'
    scrape_interval: 5s

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
'''

                    // Start Prometheus
                    sh '''
                        docker stop prometheus || true
                        docker rm prometheus || true
                        docker run -d \\
                        --name prometheus \\
                        -p 9090:9090 \\
                        -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \\
                        prom/prometheus
                    '''
                    
                    // Start Grafana
                    sh '''
                        docker stop grafana || true
                        docker rm grafana || true
                        docker run -d \\
                        --name grafana \\
                        -p 3001:3000 \\
                        -e GF_SECURITY_ADMIN_PASSWORD=admin \\
                        grafana/grafana
                    '''
                    
                    // Setup alerting rules
                    writeFile file: 'alert-rules.yml', text: '''
groups:
  - name: application-alerts
    rules:
      - alert: ApplicationDown
        expr: up{job="nodejs-app"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Application is down"
          description: "The application has been down for more than 1 minute"
      
      - alert: HighResponseTime
        expr: http_request_duration_seconds > 1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High response time detected"
'''
                    
                    // Verify monitoring setup
                    sh '''
                        echo "Waiting for monitoring services..."
                        sleep 15
                        curl -f http://localhost:9090/-/healthy || echo "Prometheus not ready"
                        curl -f http://localhost:3001/api/health || echo "Grafana not ready"
                    '''
                }
                
                // Send monitoring setup notification
                script {
                    def monitoringInfo = """
Monitoring Setup Complete:
• Prometheus: http://localhost:9090
• Grafana: http://localhost:3001 (admin/admin)
• Application Health: http://localhost:${PROD_PORT}/health
                    """
                    
                    slackSend(
                        color: 'good',
                        message: monitoringInfo
                    )
                }
            }
            post {
                success {
                    echo 'Monitoring and alerting setup complete'
                }
                failure {
                    echo 'Monitoring setup failed'
                }
            }
        }
    }
    
    post {
        always {
            echo '🧹 Pipeline cleanup'
            
            // Clean up workspace
            cleanWs()
            
            // Archive important logs
            script {
                sh '''
                    docker logs staging-app > staging-logs.txt 2>&1 || true
                    docker logs prod-app > production-logs.txt 2>&1 || true
                '''
                archiveArtifacts artifacts: '*-logs.txt', allowEmptyArchive: true
            }
        }
        
        success {
            echo 'Pipeline completed successfully!'
            slackSend(
                color: 'good',
                message: "DevOps Pipeline completed successfully! Build: ${BUILD_NUMBER}"
            )
        }
        
        failure {
            echo 'Pipeline failed!'
            slackSend(
                color: 'danger',
                message: "DevOps Pipeline failed! Build: ${BUILD_NUMBER}. Check logs for details."
            )
        }
        
        unstable {
            echo 'Pipeline completed with warnings'
            slackSend(
                color: 'warning',
                message: "DevOps Pipeline completed with warnings! Build: ${BUILD_NUMBER}"
            )
        }
    }
}
