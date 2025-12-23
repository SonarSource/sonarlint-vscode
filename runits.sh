npm i
npm run package

# Resolve Maven dependencies for Java samples before running ITs
cd its/samples/sample-java-maven-multi-module
mvn dependency:resolve -q
cd ../../..

cd its
npm i
npm test
