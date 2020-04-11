/* NIST disclaimer
==============================================================================*/

import * as nn from "./nn";
import * as playground from "./playground";
import {Example2D} from "./dataset";


/**
 * This class is for computing network inefficiency using KL divergence of pairs of histograms
 * the histograms are created at each layer from the occurrence of possible outputs generated by all nodes in one layer
 * there is one histogram per layer and per output label (-1 or 1)
 * the KL divergence of data-driven histograms (probabilities) is computed against reference probabilities assumed to be
 * uniform but scaled based on ratios of training data point per label over all training data points
 *
 * @author Peter Bajcsy
 */
export class AppendingNetworkEfficiency {
  private number_classes: number;
  private netEfficiency: number[];
  private arithmetic_avgKLdivergence: number;
  private geom_avgKLdivergence: number;
  private mapGlobal = null;
  // this is the sequence of states across layers per class label that occurs the most/lest frequently in each layer
  private stateCountMax_layer_label: number[][];
  private stateCountMin_layer_label: number[][];
  private stateKeyMax_layer_label: string[][];
  private stateKeyMin_layer_label: string[][];
  // this is the number of unique states utilized by each class label in he array across all layers
  private stateBinCount_layer_label: number[][];

  constructor() {
    this.reset();
    this.number_classes = 2;
  }

  reset() {
      this.mapGlobal = [];
      this.netEfficiency = [];
      this.stateBinCount_layer_label = [][this.number_classes ];// number of classes is 2
      this.stateCountMax_layer_label = [][this.number_classes ];
      this.stateCountMin_layer_label = [][this.number_classes ];
      this.stateKeyMax_layer_label = [][this.number_classes ];
      this.stateKeyMin_layer_label = [][this.number_classes ];
      this.arithmetic_avgKLdivergence = -1;
      this.geom_avgKLdivergence = -1;
  }

  public getMapGlobal():any[]{
    return this.mapGlobal;
  }

  public getStateBinCount_layer_label():number[][]{
    return this.stateBinCount_layer_label;
  }
  public getStateCountMax_layer_label():number[][]{
    return this.stateCountMax_layer_label;
  }
  public getStateCountMin_layer_label():number[][]{
    return this.stateCountMin_layer_label;
  }
  public getStateKeyMax_layer_label():string[][]{
    return this.stateKeyMax_layer_label;
  }
  public getStateKeyMin_layer_label():string[][]{
    return this.stateKeyMin_layer_label;
  }
  public getNetEfficiency():number[]{
    return this.netEfficiency;
  }
  public getArithmeticAvgKLdivergence():number{
    return this.arithmetic_avgKLdivergence;
  }
  public getGeometricAvgKLdivergence():number{
    return this.geom_avgKLdivergence;
  }
  /**
   * This method compute the inefficiency coefficient of each network layer
   * @param network
   */
  public getNetworkInefficiencyPerLayer(network: nn.Node[][],trainData:Example2D[], numEvalSamples:number): number[] {
    //return array
    //let netEfficiency: number[] = [];

    /* configPts contains sequences of 0 and 1 (one per layer) that
    * correspond to each node output being 0 or 1 depending on the input point
    * mapGlobal contains the histogram of those sequences over all points per network layer  */
    //let mapGlobal = [];
    for (let idx = 0; idx < network.length - 1; idx++)
      this.mapGlobal[idx] = new Map<string, number>();

    let configPts;
    // finds stats of imbalanced data
    let countNOne: number = 0; //count minus one labeled training data points
    let countPOne: number = 0; //count one labeled training data points
    trainData.forEach((point, i) => {
      let input = playground.constructInput(point.x, point.y);
      console.log('point:'+i +' val:' + input.toString() + ', label:' + point.label);
      // compute the output configuration at each layer per point
      configPts = nn.forwardNetEval(network, input);
      let output = nn.forwardProp(network, input);
      // assign hard label based on the output probability
      let label: string;
      if (output <= 0) {
        label = 'N';
      } else {
        label = 'P';
      }
      // count the ground truth labels
      if (point.label <= 0) {
        countNOne++;
      } else {
        countPOne++;
      }
      //console.log('configPts:'+configPts.toString() + ', prob label:' + output.toString() + ', resulting label:' + label.toString());

      for (let layerIdx = 1; layerIdx < network.length; layerIdx++) {
        let temp = label + '-' + configPts[layerIdx - 1]; // configuration string
        let flag = false;
        if (this.mapGlobal[layerIdx - 1].size > 0) {
          if ((this.mapGlobal[layerIdx - 1]).get(temp) > 0) {
            flag = true;
            //console.log('match: ' + temp + ', stored:' + mapGlobal[layerIdx-1].get(temp));
          }
        }
        if (flag) {
          this.mapGlobal[layerIdx - 1].set(temp, this.mapGlobal[layerIdx - 1].get(temp) + 1);
        } else {
          this.mapGlobal[layerIdx - 1].set(temp, 1);
        }
      }
    });

    //sanity check
    if(countNOne <= 0 || countPOne <= 0){
      console.log('ERROR: training data contains only one label countNOne:' + countNOne + ', countPOne:' + countPOne);
      let element = document.getElementById("KLdivergenceDiv");
      element.innerHTML = 'ERROR: training data contains only one label countNOne:' + countNOne + ', countPOne:' + countPOne;
      return null;
    }

    this.arithmetic_avgKLdivergence = 0.0;  // this is to compute arithmetic avg network KL divergence
    this.geom_avgKLdivergence = 1.0;  // this is to compute geometric avg network KL divergence

    let m: number = 2; // number of classes
    let p_PLabel: number = countPOne/numEvalSamples; // probability of label P in the training data
    let p_NLabel: number = countNOne/numEvalSamples; // probability of label N in the training data
    console.log('countNOne:' + countNOne + ', countPOne:' + countPOne + ' p_PLabel:'+p_PLabel+', p_NLabel:'+p_NLabel);

    // init the array of states counts per layer and per label
    this.stateBinCount_layer_label = new Array(network.length-1).fill(0).map(() => new Array(this.number_classes).fill(0));

    this.stateCountMax_layer_label = new Array(network.length-1).fill(0).map(() => new Array(this.number_classes).fill(Number.MIN_SAFE_INTEGER));
    this.stateCountMin_layer_label = new Array(network.length-1).fill(0).map(() => new Array(this.number_classes).fill(Number.MAX_SAFE_INTEGER));

    this.stateKeyMax_layer_label = new Array(network.length-1).fill(0).map(() => new Array(this.number_classes).fill(''));
    this.stateKeyMin_layer_label = new Array(network.length-1).fill(0).map(() => new Array(this.number_classes).fill(''));

    for (let layerIdx = 0; layerIdx < network.length - 1; layerIdx++) {
      let currentLayerNodeCount = network[layerIdx + 1].length;
      // the number of 0 or 1 sequence outcomes from a layer with currentLayerNodeCount nodes is
      // equal to 2^(currentLayerNodeCount ) .
      let numBins: number =  Math.pow(2, currentLayerNodeCount); // this is n in the ppt slides

      let maxEntropy: number  = Math.log2(numBins);
      console.log('maxEntropy for numBins:' + numBins + ' and currentLayerNodeCount:' + currentLayerNodeCount + ' is ' + maxEntropy);

      // define p_i for imbalanced classes
      // This number is multiplied by 2 since the outcomes are associated with
      // one of the two possible class labels (or  numBins corresponds to only one possible outcome)
/*      let refProb_NOne: number = 2 * (countNOne / numEvalSamples) * (1 / numBins);
      let refProb_POne: number = 2 * (countPOne / numEvalSamples) * (1 / numBins);*/
     let refProb_NOne: number = m *  (1 / numBins);
      let refProb_POne: number = m *  (1 / numBins);
/*      let refProb_NOne: number = 2 * p_NLabel / numBins;
      let refProb_POne: number = 2 * p_PLabel / numBins;*/
      console.log('refProb_NOne:' + refProb_NOne + ', refProb_POne:' + refProb_POne);

      //sanity check
      if (refProb_NOne <= 0 || refProb_POne <= 0) {
        console.log('ERROR: training data contains highly imbalanced labels refProb_NOne:' + refProb_NOne + ', refProb_POne:' + refProb_POne);
        this.netEfficiency[layerIdx] = 0;
        let element = document.getElementById("KLdivergenceDiv");
        element.innerHTML = 'ERROR: training data contains highly imbalanced labels refProb_NOne:' + refProb_NOne + ', refProb_POne:' + refProb_POne;
        return null;
      }
      // might be removed
      /*
      let samplesPerBin: number = numEvalSamples/numBins;
      console.log('num eval samples:' + numEvalSamples + ', expected number of samples per bin:' + samplesPerBin);
      // sanity check
      if (samplesPerBin < 1) {
        console.log('WARNING: there are more node outcomes (bins) than samples for numBins:' + numBins + ', numSamples:' + numSamples);
        samplesPerBin = 1.0;
      }
    */
      this.netEfficiency[layerIdx] = 0;

      this.mapGlobal[layerIdx].forEach((value: number, key: string) => {
        let prob: number;
        //prob = value / ( numEvalSamples);
        if (key.substr(0, 1) === 'N') {
          // increment the number of states used up by the class label N
          this.stateBinCount_layer_label[layerIdx][0] ++;
          // find the min and max occurring state for the label N
          if(value > this.stateCountMax_layer_label[layerIdx][0] ){
            this.stateCountMax_layer_label[layerIdx][0] = value;
            this.stateKeyMax_layer_label[layerIdx][0] = key;
          }
          if(value < this.stateCountMin_layer_label[layerIdx][0]){
            this.stateCountMin_layer_label[layerIdx][0] = value;
            this.stateKeyMin_layer_label[layerIdx][0] = key;
          }
          // compute the q_ij probability
          prob = value / ( countNOne);
          this.netEfficiency[layerIdx] = this.netEfficiency[layerIdx] + prob * Math.log2(prob / refProb_NOne);
          console.log('inside label N:' + key, value, prob);
          console.log('N label - prob x log(ratio):' + (prob * Math.log2(prob / refProb_NOne)).toString());
        } else {
          // this is the case P class label
          //increment the number of states used up by the class label P
          this.stateBinCount_layer_label[layerIdx][1] ++;
          // find the min and max occurring state for the label N
          if(value > this.stateCountMax_layer_label[layerIdx][1] ){
            this.stateCountMax_layer_label[layerIdx][1] = value;
            this.stateKeyMax_layer_label[layerIdx][1] = key;
          }
          if(value < this.stateCountMin_layer_label[layerIdx][1]){
            this.stateCountMin_layer_label[layerIdx][1] = value;
            this.stateKeyMin_layer_label[layerIdx][1] = key;
          }
          // compute the probability q_ij
          prob = value / ( countPOne);
          this.netEfficiency[layerIdx] = this.netEfficiency[layerIdx] + prob * Math.log2(prob / refProb_POne);
          console.log('inside label P:' + key, value, prob);
          console.log('P label - prob x log(ratio):' + (prob * Math.log2(prob / refProb_POne)).toString());
        }
      });
       // this check is to alert about representation insufficiency of the layer with respect to the number of classes
      if (this.netEfficiency[layerIdx] < 0) {
        console.log('WARNING: layer:' + (layerIdx) + ', netEfficiency:' + this.netEfficiency[layerIdx] + ' is less than zero');
        //this.netEfficiency[layerIdx] = 0;
      }
      console.log('layer:' + (layerIdx) + ', netEfficiency:' + this.netEfficiency[layerIdx]);
      this.arithmetic_avgKLdivergence = this.arithmetic_avgKLdivergence + this.netEfficiency[layerIdx];
      this.geom_avgKLdivergence = this.geom_avgKLdivergence * this.netEfficiency[layerIdx];
    }

    this.arithmetic_avgKLdivergence = this.arithmetic_avgKLdivergence / this.netEfficiency.length;
    console.log('arithmetic avg. network efficiency:' + (Math.round(this.arithmetic_avgKLdivergence * 1000) / 1000).toString());

    this.geom_avgKLdivergence = Math.pow(this.geom_avgKLdivergence, (1.0/this.netEfficiency.length));
    console.log('geometric avg. network efficiency:' + (Math.round(this.geom_avgKLdivergence * 1000) / 1000).toString());

    // testing purposes
    for(let k1=0;k1<this.stateBinCount_layer_label.length;k1++){ //
      for(let k2=0;k2<this.stateBinCount_layer_label[k1].length;k2++){
        console.log('stateBinCount['+k1+']['+k2+']='+this.stateBinCount_layer_label[k1][k2] + ", ");
        console.log('stateCountMax['+k1+']['+k2+']='+this.stateCountMax_layer_label[k1][k2] + ", ");
        console.log('stateKeyMax['+k1+']['+k2+']='+this.stateKeyMax_layer_label[k1][k2] + ", ");
        console.log('stateCountMin['+k1+']['+k2+']='+this.stateCountMin_layer_label[k1][k2] + ", ");
        console.log('stateKeyMin['+k1+']['+k2+']='+this.stateKeyMin_layer_label[k1][k2] + ", ");
      }

    }
    //////////////////////////////////////////////////////////////
/*    // print the histograms and create histogram visualization
    let hist = new AppendingHistogramChart(this.mapGlobal, this.netEfficiency);
    //hist.createHistogramInputs(mapGlobal,netEfficiency);
    let kl_metric_result: string = hist.showKLHistogram();

    kl_metric_result += '&nbsp; avg KL value:' + (Math.round(avgKLdivergence * 1000) / 1000).toString() + '<BR>';
    let element = document.getElementById("KLdivergenceDiv");
    element.innerHTML = kl_metric_result;*/

    return this.netEfficiency;
  }



}
