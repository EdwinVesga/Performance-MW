/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 464.0, "minX": 0.0, "maxY": 14648.0, "series": [{"data": [[0.0, 464.0], [0.1, 492.0], [0.2, 513.0], [0.3, 543.0], [0.4, 557.0], [0.5, 563.0], [0.6, 580.0], [0.7, 581.0], [0.8, 586.0], [0.9, 640.0], [1.0, 676.0], [1.1, 1278.0], [1.2, 1293.0], [1.3, 1329.0], [1.4, 1344.0], [1.5, 1351.0], [1.6, 1389.0], [1.7, 1423.0], [1.8, 1426.0], [1.9, 1475.0], [2.0, 1485.0], [2.1, 1535.0], [2.2, 1631.0], [2.3, 1659.0], [2.4, 1714.0], [2.5, 1784.0], [2.6, 1815.0], [2.7, 1857.0], [2.8, 1999.0], [2.9, 2184.0], [3.0, 2195.0], [3.1, 2236.0], [3.2, 2382.0], [3.3, 2455.0], [3.4, 2498.0], [3.5, 2544.0], [3.6, 2606.0], [3.7, 2617.0], [3.8, 2635.0], [3.9, 2662.0], [4.0, 2769.0], [4.1, 2816.0], [4.2, 2876.0], [4.3, 2886.0], [4.4, 2919.0], [4.5, 2972.0], [4.6, 2984.0], [4.7, 3002.0], [4.8, 3014.0], [4.9, 3045.0], [5.0, 3071.0], [5.1, 3097.0], [5.2, 3104.0], [5.3, 3122.0], [5.4, 3145.0], [5.5, 3169.0], [5.6, 3189.0], [5.7, 3196.0], [5.8, 3202.0], [5.9, 3209.0], [6.0, 3228.0], [6.1, 3248.0], [6.2, 3259.0], [6.3, 3282.0], [6.4, 3316.0], [6.5, 3326.0], [6.6, 3345.0], [6.7, 3354.0], [6.8, 3369.0], [6.9, 3376.0], [7.0, 3380.0], [7.1, 3411.0], [7.2, 3436.0], [7.3, 3446.0], [7.4, 3454.0], [7.5, 3478.0], [7.6, 3479.0], [7.7, 3503.0], [7.8, 3511.0], [7.9, 3537.0], [8.0, 3555.0], [8.1, 3569.0], [8.2, 3574.0], [8.3, 3596.0], [8.4, 3629.0], [8.5, 3658.0], [8.6, 3675.0], [8.7, 3697.0], [8.8, 3708.0], [8.9, 3713.0], [9.0, 3740.0], [9.1, 3757.0], [9.2, 3763.0], [9.3, 3777.0], [9.4, 3794.0], [9.5, 3815.0], [9.6, 3837.0], [9.7, 3844.0], [9.8, 3863.0], [9.9, 3889.0], [10.0, 3913.0], [10.1, 3929.0], [10.2, 3931.0], [10.3, 3933.0], [10.4, 3938.0], [10.5, 3940.0], [10.6, 3949.0], [10.7, 3952.0], [10.8, 3963.0], [10.9, 3966.0], [11.0, 3992.0], [11.1, 3994.0], [11.2, 4003.0], [11.3, 4022.0], [11.4, 4026.0], [11.5, 4035.0], [11.6, 4045.0], [11.7, 4051.0], [11.8, 4066.0], [11.9, 4080.0], [12.0, 4091.0], [12.1, 4098.0], [12.2, 4111.0], [12.3, 4117.0], [12.4, 4120.0], [12.5, 4124.0], [12.6, 4139.0], [12.7, 4148.0], [12.8, 4158.0], [12.9, 4170.0], [13.0, 4174.0], [13.1, 4179.0], [13.2, 4184.0], [13.3, 4195.0], [13.4, 4209.0], [13.5, 4222.0], [13.6, 4223.0], [13.7, 4228.0], [13.8, 4238.0], [13.9, 4248.0], [14.0, 4257.0], [14.1, 4266.0], [14.2, 4268.0], [14.3, 4277.0], [14.4, 4279.0], [14.5, 4299.0], [14.6, 4319.0], [14.7, 4327.0], [14.8, 4343.0], [14.9, 4385.0], [15.0, 4387.0], [15.1, 4392.0], [15.2, 4405.0], [15.3, 4417.0], [15.4, 4428.0], [15.5, 4429.0], [15.6, 4437.0], [15.7, 4461.0], [15.8, 4487.0], [15.9, 4518.0], [16.0, 4543.0], [16.1, 4559.0], [16.2, 4577.0], [16.3, 4584.0], [16.4, 4598.0], [16.5, 4622.0], [16.6, 4643.0], [16.7, 4646.0], [16.8, 4658.0], [16.9, 4667.0], [17.0, 4670.0], [17.1, 4671.0], [17.2, 4676.0], [17.3, 4681.0], [17.4, 4702.0], [17.5, 4705.0], [17.6, 4709.0], [17.7, 4713.0], [17.8, 4714.0], [17.9, 4735.0], [18.0, 4745.0], [18.1, 4763.0], [18.2, 4768.0], [18.3, 4781.0], [18.4, 4791.0], [18.5, 4797.0], [18.6, 4805.0], [18.7, 4806.0], [18.8, 4816.0], [18.9, 4834.0], [19.0, 4846.0], [19.1, 4869.0], [19.2, 4880.0], [19.3, 4928.0], [19.4, 4933.0], [19.5, 4941.0], [19.6, 4973.0], [19.7, 5007.0], [19.8, 5020.0], [19.9, 5036.0], [20.0, 5046.0], [20.1, 5058.0], [20.2, 5062.0], [20.3, 5071.0], [20.4, 5100.0], [20.5, 5121.0], [20.6, 5127.0], [20.7, 5144.0], [20.8, 5174.0], [20.9, 5199.0], [21.0, 5209.0], [21.1, 5229.0], [21.2, 5253.0], [21.3, 5288.0], [21.4, 5292.0], [21.5, 5302.0], [21.6, 5318.0], [21.7, 5320.0], [21.8, 5338.0], [21.9, 5349.0], [22.0, 5364.0], [22.1, 5398.0], [22.2, 5409.0], [22.3, 5419.0], [22.4, 5441.0], [22.5, 5463.0], [22.6, 5506.0], [22.7, 5524.0], [22.8, 5559.0], [22.9, 5564.0], [23.0, 5567.0], [23.1, 5591.0], [23.2, 5625.0], [23.3, 5631.0], [23.4, 5641.0], [23.5, 5648.0], [23.6, 5658.0], [23.7, 5670.0], [23.8, 5680.0], [23.9, 5688.0], [24.0, 5700.0], [24.1, 5710.0], [24.2, 5731.0], [24.3, 5755.0], [24.4, 5761.0], [24.5, 5782.0], [24.6, 5786.0], [24.7, 5808.0], [24.8, 5812.0], [24.9, 5818.0], [25.0, 5837.0], [25.1, 5839.0], [25.2, 5847.0], [25.3, 5851.0], [25.4, 5873.0], [25.5, 5883.0], [25.6, 5894.0], [25.7, 5969.0], [25.8, 5973.0], [25.9, 5988.0], [26.0, 6023.0], [26.1, 6033.0], [26.2, 6051.0], [26.3, 6060.0], [26.4, 6075.0], [26.5, 6083.0], [26.6, 6096.0], [26.7, 6105.0], [26.8, 6120.0], [26.9, 6142.0], [27.0, 6143.0], [27.1, 6152.0], [27.2, 6201.0], [27.3, 6205.0], [27.4, 6214.0], [27.5, 6224.0], [27.6, 6237.0], [27.7, 6260.0], [27.8, 6267.0], [27.9, 6287.0], [28.0, 6308.0], [28.1, 6316.0], [28.2, 6330.0], [28.3, 6341.0], [28.4, 6362.0], [28.5, 6373.0], [28.6, 6375.0], [28.7, 6385.0], [28.8, 6389.0], [28.9, 6411.0], [29.0, 6426.0], [29.1, 6443.0], [29.2, 6459.0], [29.3, 6490.0], [29.4, 6496.0], [29.5, 6512.0], [29.6, 6516.0], [29.7, 6533.0], [29.8, 6557.0], [29.9, 6585.0], [30.0, 6598.0], [30.1, 6603.0], [30.2, 6611.0], [30.3, 6621.0], [30.4, 6644.0], [30.5, 6662.0], [30.6, 6672.0], [30.7, 6684.0], [30.8, 6694.0], [30.9, 6698.0], [31.0, 6708.0], [31.1, 6726.0], [31.2, 6728.0], [31.3, 6742.0], [31.4, 6756.0], [31.5, 6764.0], [31.6, 6784.0], [31.7, 6809.0], [31.8, 6820.0], [31.9, 6825.0], [32.0, 6841.0], [32.1, 6847.0], [32.2, 6852.0], [32.3, 6857.0], [32.4, 6864.0], [32.5, 6868.0], [32.6, 6874.0], [32.7, 6907.0], [32.8, 6909.0], [32.9, 6927.0], [33.0, 6956.0], [33.1, 6969.0], [33.2, 6980.0], [33.3, 6989.0], [33.4, 6991.0], [33.5, 6999.0], [33.6, 7021.0], [33.7, 7036.0], [33.8, 7051.0], [33.9, 7056.0], [34.0, 7065.0], [34.1, 7073.0], [34.2, 7077.0], [34.3, 7080.0], [34.4, 7089.0], [34.5, 7102.0], [34.6, 7111.0], [34.7, 7117.0], [34.8, 7123.0], [34.9, 7129.0], [35.0, 7136.0], [35.1, 7139.0], [35.2, 7141.0], [35.3, 7155.0], [35.4, 7160.0], [35.5, 7163.0], [35.6, 7190.0], [35.7, 7210.0], [35.8, 7216.0], [35.9, 7222.0], [36.0, 7237.0], [36.1, 7241.0], [36.2, 7243.0], [36.3, 7255.0], [36.4, 7255.0], [36.5, 7269.0], [36.6, 7275.0], [36.7, 7290.0], [36.8, 7295.0], [36.9, 7303.0], [37.0, 7324.0], [37.1, 7328.0], [37.2, 7340.0], [37.3, 7348.0], [37.4, 7350.0], [37.5, 7355.0], [37.6, 7363.0], [37.7, 7366.0], [37.8, 7385.0], [37.9, 7398.0], [38.0, 7406.0], [38.1, 7415.0], [38.2, 7434.0], [38.3, 7435.0], [38.4, 7442.0], [38.5, 7455.0], [38.6, 7461.0], [38.7, 7467.0], [38.8, 7473.0], [38.9, 7476.0], [39.0, 7485.0], [39.1, 7489.0], [39.2, 7502.0], [39.3, 7505.0], [39.4, 7511.0], [39.5, 7516.0], [39.6, 7529.0], [39.7, 7544.0], [39.8, 7553.0], [39.9, 7558.0], [40.0, 7563.0], [40.1, 7577.0], [40.2, 7600.0], [40.3, 7614.0], [40.4, 7632.0], [40.5, 7649.0], [40.6, 7652.0], [40.7, 7658.0], [40.8, 7666.0], [40.9, 7673.0], [41.0, 7677.0], [41.1, 7701.0], [41.2, 7729.0], [41.3, 7734.0], [41.4, 7751.0], [41.5, 7755.0], [41.6, 7759.0], [41.7, 7763.0], [41.8, 7773.0], [41.9, 7786.0], [42.0, 7799.0], [42.1, 7804.0], [42.2, 7811.0], [42.3, 7817.0], [42.4, 7818.0], [42.5, 7826.0], [42.6, 7839.0], [42.7, 7850.0], [42.8, 7853.0], [42.9, 7855.0], [43.0, 7880.0], [43.1, 7894.0], [43.2, 7910.0], [43.3, 7913.0], [43.4, 7941.0], [43.5, 7948.0], [43.6, 7960.0], [43.7, 7966.0], [43.8, 7971.0], [43.9, 7979.0], [44.0, 7980.0], [44.1, 7986.0], [44.2, 8001.0], [44.3, 8007.0], [44.4, 8015.0], [44.5, 8024.0], [44.6, 8042.0], [44.7, 8045.0], [44.8, 8057.0], [44.9, 8062.0], [45.0, 8078.0], [45.1, 8081.0], [45.2, 8089.0], [45.3, 8098.0], [45.4, 8105.0], [45.5, 8106.0], [45.6, 8111.0], [45.7, 8118.0], [45.8, 8125.0], [45.9, 8140.0], [46.0, 8143.0], [46.1, 8152.0], [46.2, 8153.0], [46.3, 8178.0], [46.4, 8186.0], [46.5, 8192.0], [46.6, 8199.0], [46.7, 8202.0], [46.8, 8216.0], [46.9, 8226.0], [47.0, 8235.0], [47.1, 8238.0], [47.2, 8244.0], [47.3, 8260.0], [47.4, 8268.0], [47.5, 8286.0], [47.6, 8289.0], [47.7, 8293.0], [47.8, 8297.0], [47.9, 8305.0], [48.0, 8321.0], [48.1, 8323.0], [48.2, 8340.0], [48.3, 8369.0], [48.4, 8376.0], [48.5, 8396.0], [48.6, 8401.0], [48.7, 8411.0], [48.8, 8419.0], [48.9, 8432.0], [49.0, 8436.0], [49.1, 8438.0], [49.2, 8443.0], [49.3, 8451.0], [49.4, 8474.0], [49.5, 8481.0], [49.6, 8483.0], [49.7, 8504.0], [49.8, 8511.0], [49.9, 8527.0], [50.0, 8544.0], [50.1, 8577.0], [50.2, 8589.0], [50.3, 8607.0], [50.4, 8611.0], [50.5, 8638.0], [50.6, 8641.0], [50.7, 8647.0], [50.8, 8659.0], [50.9, 8670.0], [51.0, 8693.0], [51.1, 8705.0], [51.2, 8708.0], [51.3, 8731.0], [51.4, 8774.0], [51.5, 8780.0], [51.6, 8802.0], [51.7, 8805.0], [51.8, 8808.0], [51.9, 8840.0], [52.0, 8856.0], [52.1, 8893.0], [52.2, 8921.0], [52.3, 8935.0], [52.4, 8956.0], [52.5, 8981.0], [52.6, 9036.0], [52.7, 9047.0], [52.8, 9073.0], [52.9, 9087.0], [53.0, 9118.0], [53.1, 9126.0], [53.2, 9141.0], [53.3, 9217.0], [53.4, 9230.0], [53.5, 9250.0], [53.6, 9272.0], [53.7, 9285.0], [53.8, 9320.0], [53.9, 9326.0], [54.0, 9335.0], [54.1, 9344.0], [54.2, 9353.0], [54.3, 9369.0], [54.4, 9375.0], [54.5, 9389.0], [54.6, 9398.0], [54.7, 9409.0], [54.8, 9412.0], [54.9, 9419.0], [55.0, 9431.0], [55.1, 9469.0], [55.2, 9478.0], [55.3, 9491.0], [55.4, 9499.0], [55.5, 9511.0], [55.6, 9517.0], [55.7, 9544.0], [55.8, 9558.0], [55.9, 9578.0], [56.0, 9583.0], [56.1, 9599.0], [56.2, 9601.0], [56.3, 9605.0], [56.4, 9609.0], [56.5, 9610.0], [56.6, 9614.0], [56.7, 9619.0], [56.8, 9624.0], [56.9, 9629.0], [57.0, 9643.0], [57.1, 9651.0], [57.2, 9660.0], [57.3, 9674.0], [57.4, 9677.0], [57.5, 9684.0], [57.6, 9689.0], [57.7, 9703.0], [57.8, 9711.0], [57.9, 9718.0], [58.0, 9738.0], [58.1, 9748.0], [58.2, 9754.0], [58.3, 9766.0], [58.4, 9770.0], [58.5, 9794.0], [58.6, 9799.0], [58.7, 9830.0], [58.8, 9859.0], [58.9, 9883.0], [59.0, 9906.0], [59.1, 9917.0], [59.2, 9922.0], [59.3, 9941.0], [59.4, 9957.0], [59.5, 9966.0], [59.6, 9978.0], [59.7, 9988.0], [59.8, 9993.0], [59.9, 10018.0], [60.0, 10034.0], [60.1, 10062.0], [60.2, 10065.0], [60.3, 10075.0], [60.4, 10088.0], [60.5, 10097.0], [60.6, 10103.0], [60.7, 10117.0], [60.8, 10118.0], [60.9, 10143.0], [61.0, 10148.0], [61.1, 10151.0], [61.2, 10154.0], [61.3, 10160.0], [61.4, 10172.0], [61.5, 10175.0], [61.6, 10183.0], [61.7, 10199.0], [61.8, 10216.0], [61.9, 10228.0], [62.0, 10235.0], [62.1, 10246.0], [62.2, 10267.0], [62.3, 10280.0], [62.4, 10298.0], [62.5, 10301.0], [62.6, 10308.0], [62.7, 10333.0], [62.8, 10345.0], [62.9, 10349.0], [63.0, 10351.0], [63.1, 10364.0], [63.2, 10370.0], [63.3, 10399.0], [63.4, 10414.0], [63.5, 10422.0], [63.6, 10424.0], [63.7, 10445.0], [63.8, 10455.0], [63.9, 10465.0], [64.0, 10475.0], [64.1, 10507.0], [64.2, 10510.0], [64.3, 10518.0], [64.4, 10526.0], [64.5, 10534.0], [64.6, 10553.0], [64.7, 10559.0], [64.8, 10565.0], [64.9, 10572.0], [65.0, 10581.0], [65.1, 10584.0], [65.2, 10596.0], [65.3, 10600.0], [65.4, 10608.0], [65.5, 10613.0], [65.6, 10614.0], [65.7, 10620.0], [65.8, 10643.0], [65.9, 10650.0], [66.0, 10660.0], [66.1, 10661.0], [66.2, 10676.0], [66.3, 10704.0], [66.4, 10712.0], [66.5, 10716.0], [66.6, 10720.0], [66.7, 10735.0], [66.8, 10750.0], [66.9, 10752.0], [67.0, 10777.0], [67.1, 10791.0], [67.2, 10800.0], [67.3, 10816.0], [67.4, 10830.0], [67.5, 10837.0], [67.6, 10851.0], [67.7, 10861.0], [67.8, 10865.0], [67.9, 10873.0], [68.0, 10890.0], [68.1, 10913.0], [68.2, 10922.0], [68.3, 10945.0], [68.4, 10953.0], [68.5, 10974.0], [68.6, 11000.0], [68.7, 11012.0], [68.8, 11020.0], [68.9, 11055.0], [69.0, 11057.0], [69.1, 11062.0], [69.2, 11075.0], [69.3, 11076.0], [69.4, 11090.0], [69.5, 11101.0], [69.6, 11103.0], [69.7, 11115.0], [69.8, 11121.0], [69.9, 11132.0], [70.0, 11139.0], [70.1, 11165.0], [70.2, 11181.0], [70.3, 11184.0], [70.4, 11196.0], [70.5, 11207.0], [70.6, 11224.0], [70.7, 11247.0], [70.8, 11254.0], [70.9, 11265.0], [71.0, 11272.0], [71.1, 11286.0], [71.2, 11311.0], [71.3, 11322.0], [71.4, 11375.0], [71.5, 11394.0], [71.6, 11400.0], [71.7, 11408.0], [71.8, 11419.0], [71.9, 11431.0], [72.0, 11459.0], [72.1, 11462.0], [72.2, 11485.0], [72.3, 11502.0], [72.4, 11510.0], [72.5, 11538.0], [72.6, 11560.0], [72.7, 11569.0], [72.8, 11588.0], [72.9, 11594.0], [73.0, 11599.0], [73.1, 11605.0], [73.2, 11612.0], [73.3, 11619.0], [73.4, 11622.0], [73.5, 11641.0], [73.6, 11652.0], [73.7, 11664.0], [73.8, 11681.0], [73.9, 11692.0], [74.0, 11694.0], [74.1, 11709.0], [74.2, 11724.0], [74.3, 11727.0], [74.4, 11743.0], [74.5, 11758.0], [74.6, 11772.0], [74.7, 11773.0], [74.8, 11784.0], [74.9, 11795.0], [75.0, 11808.0], [75.1, 11811.0], [75.2, 11820.0], [75.3, 11836.0], [75.4, 11842.0], [75.5, 11844.0], [75.6, 11847.0], [75.7, 11862.0], [75.8, 11875.0], [75.9, 11886.0], [76.0, 11907.0], [76.1, 11909.0], [76.2, 11930.0], [76.3, 11936.0], [76.4, 11947.0], [76.5, 11950.0], [76.6, 11965.0], [76.7, 11975.0], [76.8, 11997.0], [76.9, 12014.0], [77.0, 12018.0], [77.1, 12027.0], [77.2, 12037.0], [77.3, 12040.0], [77.4, 12047.0], [77.5, 12061.0], [77.6, 12070.0], [77.7, 12084.0], [77.8, 12095.0], [77.9, 12113.0], [78.0, 12121.0], [78.1, 12129.0], [78.2, 12141.0], [78.3, 12148.0], [78.4, 12161.0], [78.5, 12177.0], [78.6, 12178.0], [78.7, 12193.0], [78.8, 12200.0], [78.9, 12205.0], [79.0, 12220.0], [79.1, 12240.0], [79.2, 12254.0], [79.3, 12257.0], [79.4, 12267.0], [79.5, 12279.0], [79.6, 12299.0], [79.7, 12313.0], [79.8, 12325.0], [79.9, 12332.0], [80.0, 12338.0], [80.1, 12352.0], [80.2, 12360.0], [80.3, 12365.0], [80.4, 12378.0], [80.5, 12392.0], [80.6, 12400.0], [80.7, 12403.0], [80.8, 12411.0], [80.9, 12418.0], [81.0, 12422.0], [81.1, 12430.0], [81.2, 12439.0], [81.3, 12443.0], [81.4, 12452.0], [81.5, 12458.0], [81.6, 12467.0], [81.7, 12488.0], [81.8, 12497.0], [81.9, 12509.0], [82.0, 12528.0], [82.1, 12529.0], [82.2, 12533.0], [82.3, 12550.0], [82.4, 12575.0], [82.5, 12576.0], [82.6, 12586.0], [82.7, 12593.0], [82.8, 12596.0], [82.9, 12599.0], [83.0, 12601.0], [83.1, 12606.0], [83.2, 12616.0], [83.3, 12620.0], [83.4, 12622.0], [83.5, 12624.0], [83.6, 12628.0], [83.7, 12629.0], [83.8, 12645.0], [83.9, 12652.0], [84.0, 12654.0], [84.1, 12658.0], [84.2, 12664.0], [84.3, 12666.0], [84.4, 12673.0], [84.5, 12674.0], [84.6, 12688.0], [84.7, 12690.0], [84.8, 12702.0], [84.9, 12711.0], [85.0, 12717.0], [85.1, 12719.0], [85.2, 12721.0], [85.3, 12727.0], [85.4, 12729.0], [85.5, 12737.0], [85.6, 12741.0], [85.7, 12748.0], [85.8, 12753.0], [85.9, 12760.0], [86.0, 12767.0], [86.1, 12769.0], [86.2, 12773.0], [86.3, 12775.0], [86.4, 12779.0], [86.5, 12785.0], [86.6, 12787.0], [86.7, 12795.0], [86.8, 12803.0], [86.9, 12806.0], [87.0, 12813.0], [87.1, 12822.0], [87.2, 12826.0], [87.3, 12834.0], [87.4, 12842.0], [87.5, 12846.0], [87.6, 12847.0], [87.7, 12866.0], [87.8, 12876.0], [87.9, 12878.0], [88.0, 12887.0], [88.1, 12887.0], [88.2, 12898.0], [88.3, 12918.0], [88.4, 12919.0], [88.5, 12937.0], [88.6, 12951.0], [88.7, 12957.0], [88.8, 12966.0], [88.9, 12977.0], [89.0, 12982.0], [89.1, 13000.0], [89.2, 13005.0], [89.3, 13008.0], [89.4, 13013.0], [89.5, 13017.0], [89.6, 13026.0], [89.7, 13037.0], [89.8, 13050.0], [89.9, 13054.0], [90.0, 13068.0], [90.1, 13071.0], [90.2, 13082.0], [90.3, 13099.0], [90.4, 13117.0], [90.5, 13121.0], [90.6, 13138.0], [90.7, 13143.0], [90.8, 13155.0], [90.9, 13159.0], [91.0, 13168.0], [91.1, 13178.0], [91.2, 13199.0], [91.3, 13203.0], [91.4, 13217.0], [91.5, 13228.0], [91.6, 13246.0], [91.7, 13269.0], [91.8, 13281.0], [91.9, 13299.0], [92.0, 13327.0], [92.1, 13342.0], [92.2, 13362.0], [92.3, 13383.0], [92.4, 13386.0], [92.5, 13396.0], [92.6, 13403.0], [92.7, 13421.0], [92.8, 13424.0], [92.9, 13437.0], [93.0, 13442.0], [93.1, 13460.0], [93.2, 13466.0], [93.3, 13490.0], [93.4, 13515.0], [93.5, 13523.0], [93.6, 13539.0], [93.7, 13550.0], [93.8, 13569.0], [93.9, 13576.0], [94.0, 13586.0], [94.1, 13594.0], [94.2, 13595.0], [94.3, 13606.0], [94.4, 13618.0], [94.5, 13622.0], [94.6, 13625.0], [94.7, 13635.0], [94.8, 13648.0], [94.9, 13665.0], [95.0, 13673.0], [95.1, 13686.0], [95.2, 13699.0], [95.3, 13703.0], [95.4, 13707.0], [95.5, 13716.0], [95.6, 13726.0], [95.7, 13735.0], [95.8, 13740.0], [95.9, 13744.0], [96.0, 13756.0], [96.1, 13767.0], [96.2, 13770.0], [96.3, 13772.0], [96.4, 13774.0], [96.5, 13775.0], [96.6, 13779.0], [96.7, 13784.0], [96.8, 13786.0], [96.9, 13791.0], [97.0, 13794.0], [97.1, 13798.0], [97.2, 13810.0], [97.3, 13812.0], [97.4, 13819.0], [97.5, 13830.0], [97.6, 13838.0], [97.7, 13851.0], [97.8, 13858.0], [97.9, 13879.0], [98.0, 13903.0], [98.1, 13909.0], [98.2, 13917.0], [98.3, 13931.0], [98.4, 13964.0], [98.5, 13976.0], [98.6, 13990.0], [98.7, 13994.0], [98.8, 14000.0], [98.9, 14036.0], [99.0, 14044.0], [99.1, 14059.0], [99.2, 14070.0], [99.3, 14081.0], [99.4, 14110.0], [99.5, 14271.0], [99.6, 14283.0], [99.7, 14359.0], [99.8, 14482.0], [99.9, 14620.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 400.0, "maxY": 40.0, "series": [{"data": [[400.0, 3.0], [500.0, 13.0], [600.0, 4.0], [1200.0, 4.0], [1300.0, 9.0], [1400.0, 7.0], [1500.0, 4.0], [1600.0, 3.0], [1700.0, 4.0], [1800.0, 5.0], [1900.0, 1.0], [2000.0, 1.0], [2100.0, 3.0], [2200.0, 3.0], [2300.0, 1.0], [2400.0, 4.0], [2500.0, 2.0], [2600.0, 9.0], [2700.0, 2.0], [2800.0, 5.0], [2900.0, 7.0], [3000.0, 9.0], [3100.0, 13.0], [3200.0, 11.0], [3300.0, 14.0], [3400.0, 13.0], [3500.0, 13.0], [3700.0, 14.0], [3600.0, 8.0], [3800.0, 10.0], [3900.0, 24.0], [4000.0, 19.0], [4100.0, 24.0], [4300.0, 13.0], [4200.0, 24.0], [4400.0, 14.0], [4500.0, 11.0], [4600.0, 19.0], [4700.0, 23.0], [4800.0, 14.0], [5000.0, 14.0], [5100.0, 11.0], [4900.0, 9.0], [5300.0, 13.0], [5200.0, 11.0], [5400.0, 9.0], [5500.0, 11.0], [5600.0, 17.0], [5700.0, 13.0], [5800.0, 20.0], [6100.0, 10.0], [5900.0, 7.0], [6000.0, 14.0], [6200.0, 15.0], [6300.0, 19.0], [6500.0, 12.0], [6600.0, 18.0], [6400.0, 11.0], [6700.0, 15.0], [6800.0, 20.0], [6900.0, 17.0], [7000.0, 19.0], [7100.0, 23.0], [7200.0, 25.0], [7400.0, 25.0], [7300.0, 21.0], [7500.0, 21.0], [7600.0, 18.0], [7700.0, 19.0], [7900.0, 20.0], [7800.0, 22.0], [8100.0, 26.0], [8000.0, 25.0], [8400.0, 23.0], [8200.0, 23.0], [8300.0, 14.0], [8500.0, 11.0], [8600.0, 17.0], [8700.0, 10.0], [8900.0, 8.0], [8800.0, 11.0], [9000.0, 8.0], [9100.0, 7.0], [9200.0, 9.0], [9300.0, 18.0], [9400.0, 16.0], [9500.0, 15.0], [9600.0, 30.0], [9700.0, 19.0], [9800.0, 7.0], [9900.0, 17.0], [10200.0, 15.0], [10100.0, 24.0], [10000.0, 14.0], [10500.0, 23.0], [10300.0, 17.0], [10700.0, 18.0], [10400.0, 15.0], [10600.0, 21.0], [11000.0, 18.0], [10800.0, 18.0], [10900.0, 10.0], [11100.0, 19.0], [11200.0, 14.0], [11300.0, 9.0], [11500.0, 15.0], [11600.0, 20.0], [11700.0, 18.0], [11400.0, 14.0], [11900.0, 18.0], [12000.0, 21.0], [12100.0, 18.0], [11800.0, 20.0], [12200.0, 17.0], [12400.0, 25.0], [12500.0, 22.0], [12300.0, 19.0], [12600.0, 37.0], [12700.0, 40.0], [13000.0, 25.0], [12900.0, 17.0], [13100.0, 19.0], [12800.0, 29.0], [13300.0, 12.0], [13200.0, 13.0], [13400.0, 16.0], [13500.0, 18.0], [13600.0, 20.0], [13800.0, 17.0], [13700.0, 38.0], [14000.0, 12.0], [14200.0, 3.0], [14300.0, 2.0], [14100.0, 2.0], [13900.0, 16.0], [14400.0, 2.0], [14600.0, 2.0], [14500.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 14600.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 3.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1960.0, "series": [{"data": [[1.0, 37.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 3.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1960.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 193.71428571428572, "minX": 1.54960818E12, "maxY": 805.7614913176703, "series": [{"data": [[1.54960824E12, 805.7614913176703], [1.54960818E12, 193.71428571428572]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960824E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 1824.0, "minX": 1.0, "maxY": 14648.0, "series": [{"data": [[2.0, 13772.0], [3.0, 13099.0], [4.0, 12887.0], [5.0, 13156.0], [7.0, 13739.0], [8.0, 13926.5], [9.0, 13905.0], [10.0, 13779.0], [11.0, 12887.0], [13.0, 13398.0], [14.0, 13299.0], [15.0, 12957.0], [16.0, 13424.0], [17.0, 13766.0], [18.0, 13997.0], [19.0, 14054.0], [20.0, 12847.0], [21.0, 13228.0], [22.0, 13792.0], [23.0, 14044.0], [24.0, 13785.0], [25.0, 14000.0], [26.0, 12845.0], [28.0, 13581.5], [30.0, 13893.0], [31.0, 13931.0], [33.0, 13756.0], [32.0, 13071.0], [35.0, 14081.0], [34.0, 13990.0], [37.0, 13700.0], [36.0, 13694.0], [39.0, 13994.0], [38.0, 13134.0], [41.0, 14039.0], [40.0, 13784.0], [43.0, 13740.0], [45.0, 13917.0], [44.0, 13897.0], [47.0, 13858.0], [46.0, 13159.0], [49.0, 13298.0], [51.0, 12822.0], [50.0, 13838.0], [53.0, 13665.0], [52.0, 13506.0], [55.0, 13071.0], [54.0, 13992.0], [57.0, 12836.0], [56.0, 14086.0], [59.0, 12826.0], [58.0, 14064.0], [60.0, 13117.0], [63.0, 13851.0], [62.0, 13575.5], [67.0, 13768.0], [66.0, 12868.0], [65.0, 13903.0], [64.0, 13755.0], [71.0, 13013.0], [70.0, 14017.0], [69.0, 13712.0], [68.0, 13797.0], [75.0, 12990.0], [74.0, 13625.0], [73.0, 13017.0], [72.0, 12880.0], [79.0, 13920.0], [78.0, 13650.0], [77.0, 13185.0], [76.0, 12824.0], [83.0, 12768.0], [82.0, 12813.0], [81.0, 13437.0], [80.0, 13143.0], [87.0, 13150.0], [86.0, 13770.0], [85.0, 12697.0], [84.0, 13740.0], [91.0, 13246.0], [90.0, 14080.0], [88.0, 13368.0], [95.0, 13622.0], [94.0, 13830.0], [93.0, 13155.0], [92.0, 12846.0], [96.0, 3535.75], [99.0, 7046.5], [98.0, 13405.5], [101.0, 7268.0], [103.0, 6765.5], [102.0, 13673.0], [100.0, 13203.0], [104.0, 3869.5], [107.0, 12876.0], [106.0, 12782.0], [105.0, 12898.0], [108.0, 4932.0], [109.0, 6639.0], [111.0, 4797.666666666667], [110.0, 7233.0], [112.0, 2621.0], [115.0, 12721.0], [114.0, 13740.0], [113.0, 13594.0], [119.0, 12753.0], [118.0, 12764.0], [117.0, 13005.0], [116.0, 13117.0], [123.0, 13812.0], [122.0, 13648.0], [121.0, 13879.0], [120.0, 13178.0], [127.0, 12654.0], [126.0, 13444.0], [125.0, 13003.0], [124.0, 12622.0], [135.0, 14110.0], [134.0, 13330.0], [132.0, 12918.0], [131.0, 12748.0], [130.0, 12796.0], [129.0, 13070.0], [128.0, 12601.0], [143.0, 12977.0], [142.0, 13606.0], [140.0, 12729.0], [139.0, 13604.0], [138.0, 13703.0], [137.0, 13819.0], [136.0, 13421.0], [151.0, 13442.0], [150.0, 13017.0], [149.0, 13522.0], [148.0, 14271.0], [147.0, 12658.0], [146.0, 12624.0], [145.0, 13247.0], [144.0, 13054.0], [159.0, 12760.0], [158.0, 13790.0], [157.0, 13549.0], [156.0, 13735.0], [155.0, 12772.0], [154.0, 13538.0], [153.0, 12890.0], [152.0, 13767.0], [167.0, 13415.0], [166.0, 12626.0], [165.0, 13269.0], [164.0, 13396.0], [163.0, 13007.0], [162.0, 13677.0], [161.0, 12976.0], [160.0, 13635.0], [175.0, 12624.0], [174.0, 12904.0], [172.0, 13206.0], [171.0, 12878.0], [170.0, 13557.0], [169.0, 12702.0], [168.0, 12769.0], [183.0, 13744.0], [182.0, 13281.0], [181.0, 12648.0], [180.0, 13432.0], [179.0, 13168.0], [178.0, 12774.0], [177.0, 13121.0], [176.0, 13729.0], [191.0, 13523.0], [190.0, 12728.0], [189.0, 13644.0], [188.0, 13160.0], [187.0, 13225.0], [186.0, 13312.0], [185.0, 13262.0], [199.0, 13726.0], [198.0, 12773.0], [197.0, 14070.0], [196.0, 13699.0], [195.0, 13285.0], [194.0, 13287.5], [192.0, 12528.0], [207.0, 12509.0], [206.0, 12575.0], [205.0, 13000.0], [204.0, 12419.0], [203.0, 12383.0], [202.0, 12455.0], [201.0, 12712.0], [200.0, 13515.0], [215.0, 12497.0], [214.0, 12529.0], [213.0, 13278.0], [212.0, 12439.0], [211.0, 13489.0], [210.0, 13421.0], [209.0, 12926.0], [208.0, 13811.0], [223.0, 12747.0], [222.0, 12621.0], [221.0, 13586.0], [220.0, 13008.0], [219.0, 14648.0], [218.0, 13460.0], [217.0, 12977.0], [216.0, 12760.0], [231.0, 13584.0], [230.0, 12602.0], [229.0, 12600.0], [228.0, 13068.0], [227.0, 13476.0], [225.0, 12325.0], [224.0, 13618.0], [239.0, 12719.0], [238.0, 12403.0], [237.0, 12488.0], [236.0, 12982.0], [235.0, 12586.0], [234.0, 13383.0], [233.0, 12616.0], [232.0, 13618.0], [247.0, 13910.0], [246.0, 12711.0], [245.0, 12645.0], [244.0, 12615.0], [242.0, 13139.0], [241.0, 12787.0], [240.0, 12806.0], [253.0, 4101.0], [252.0, 5496.333333333333], [251.0, 7370.0], [255.0, 12576.0], [254.0, 12951.0], [250.0, 13327.0], [249.0, 12737.0], [248.0, 12378.0], [270.0, 7422.5], [257.0, 7025.5], [258.0, 7058.0], [259.0, 12687.0], [260.0, 7093.0], [261.0, 13608.0], [264.0, 5425.666666666666], [267.0, 12369.0], [266.0, 12148.0], [265.0, 12717.0], [263.0, 7390.5], [256.0, 12401.0], [262.0, 12887.0], [271.0, 13627.0], [269.0, 12719.0], [268.0, 12779.0], [286.0, 12027.0], [278.0, 9477.333333333334], [276.0, 13572.0], [279.0, 7265.0], [284.0, 6823.5], [275.0, 13344.0], [274.0, 13830.0], [273.0, 13800.0], [272.0, 12787.0], [287.0, 12177.0], [285.0, 13342.0], [283.0, 13703.0], [282.0, 13775.0], [281.0, 12262.0], [280.0, 13779.0], [303.0, 12656.0], [295.0, 7193.5], [294.0, 13490.0], [293.0, 12673.0], [292.0, 12596.0], [298.0, 7404.5], [302.0, 12257.0], [301.0, 13400.0], [300.0, 12332.0], [291.0, 12644.0], [290.0, 12409.0], [289.0, 12220.0], [288.0, 12530.0], [299.0, 12620.0], [297.0, 12467.0], [296.0, 13669.0], [318.0, 12836.0], [306.0, 4951.333333333334], [305.0, 13059.0], [304.0, 12529.0], [309.0, 7299.0], [308.0, 14592.0], [310.0, 11846.0], [311.0, 6670.0], [319.0, 4976.333333333334], [316.0, 12965.0], [307.0, 12628.0], [315.0, 11905.0], [314.0, 12617.0], [313.0, 11394.0], [312.0, 12834.0], [335.0, 11909.0], [326.0, 8769.0], [324.0, 12400.0], [333.0, 6718.0], [334.0, 12737.0], [332.0, 11864.0], [323.0, 11950.0], [322.0, 12673.0], [321.0, 12828.0], [320.0, 11907.0], [327.0, 11681.0], [331.0, 11667.0], [330.0, 12919.0], [329.0, 11833.0], [328.0, 12690.0], [349.0, 6731.0], [339.0, 7251.5], [342.0, 1824.0], [341.0, 12397.0], [340.0, 11213.0], [343.0, 12464.0], [336.0, 12446.0], [338.0, 11651.0], [337.0, 11461.0], [348.0, 6783.5], [351.0, 7127.0], [350.0, 12364.0], [347.0, 11485.0], [346.0, 12443.0], [345.0, 11729.0], [344.0, 14036.0], [367.0, 12220.0], [360.0, 6543.5], [366.0, 11594.0], [365.0, 12254.0], [364.0, 14149.0], [355.0, 14300.0], [354.0, 13171.0], [353.0, 12734.0], [352.0, 13115.0], [363.0, 11473.0], [362.0, 12353.0], [361.0, 12673.0], [359.0, 12267.0], [358.0, 12595.0], [357.0, 13036.0], [356.0, 11399.0], [383.0, 12193.0], [371.0, 6904.5], [375.0, 12365.0], [370.0, 12021.5], [368.0, 11636.0], [374.0, 13466.0], [373.0, 12278.0], [372.0, 12338.0], [379.0, 8165.0], [382.0, 14482.0], [381.0, 12160.0], [380.0, 11101.0], [378.0, 12326.0], [377.0, 12205.0], [376.0, 11313.0], [399.0, 12313.0], [394.0, 8220.5], [398.0, 7274.5], [397.0, 11257.0], [396.0, 12360.0], [387.0, 12245.0], [386.0, 12460.0], [385.0, 13782.0], [384.0, 13798.0], [395.0, 12050.0], [393.0, 11949.0], [392.0, 11275.0], [391.0, 12047.0], [390.0, 11932.0], [389.0, 11020.0], [388.0, 12240.0], [414.0, 12203.0], [415.0, 12688.0], [413.0, 11709.0], [412.0, 12416.0], [411.0, 11975.0], [410.0, 13217.0], [409.0, 12129.0], [408.0, 12070.0], [407.0, 11811.0], [401.0, 12422.0], [400.0, 12418.0], [403.0, 11862.0], [402.0, 12392.0], [406.0, 11886.0], [405.0, 11966.0], [404.0, 12124.0], [430.0, 11820.0], [431.0, 11076.0], [429.0, 12145.0], [428.0, 11103.0], [427.0, 12177.0], [426.0, 12096.0], [425.0, 12310.0], [424.0, 14077.0], [423.0, 13050.0], [417.0, 11758.0], [416.0, 11981.0], [419.0, 12198.0], [418.0, 14283.0], [422.0, 12878.0], [421.0, 12785.0], [420.0, 12599.0], [446.0, 11599.0], [447.0, 11619.0], [445.0, 11847.0], [444.0, 12113.0], [443.0, 12161.0], [442.0, 11952.0], [441.0, 11875.0], [440.0, 12666.0], [439.0, 11594.0], [433.0, 11003.0], [432.0, 11080.0], [435.0, 12121.0], [434.0, 13594.0], [438.0, 11605.0], [437.0, 11814.0], [436.0, 10867.0], [462.0, 13385.0], [463.0, 11947.0], [461.0, 13082.0], [460.0, 12866.0], [459.0, 11459.0], [458.0, 11569.0], [457.0, 12319.0], [456.0, 12037.0], [455.0, 11842.0], [449.0, 13716.0], [448.0, 12552.0], [451.0, 11612.0], [450.0, 13786.0], [454.0, 11937.0], [453.0, 12001.0], [452.0, 12141.0], [478.0, 12653.0], [465.0, 7395.0], [464.0, 11555.0], [467.0, 11694.0], [466.0, 13464.0], [471.0, 12352.0], [470.0, 11804.0], [469.0, 11908.0], [468.0, 12095.0], [479.0, 11795.0], [477.0, 12491.0], [476.0, 12084.0], [475.0, 11997.0], [474.0, 13362.0], [473.0, 13606.0], [472.0, 13833.0], [494.0, 13403.0], [495.0, 12658.0], [493.0, 11597.5], [483.0, 12726.0], [482.0, 13595.0], [481.0, 11538.0], [480.0, 11808.0], [491.0, 13569.0], [490.0, 12038.0], [489.0, 12441.0], [488.0, 12741.0], [487.0, 12333.0], [486.0, 11620.0], [485.0, 10351.0], [484.0, 11431.0], [510.0, 12061.0], [496.0, 7106.5], [498.0, 11568.0], [497.0, 12431.0], [503.0, 11682.0], [502.0, 12918.0], [501.0, 12133.0], [500.0, 12109.0], [511.0, 12411.0], [509.0, 12847.0], [508.0, 11513.0], [507.0, 11265.0], [506.0, 12513.0], [505.0, 12193.0], [504.0, 11587.0], [540.0, 7012.0], [523.0, 6773.5], [522.0, 11134.0], [521.0, 12966.0], [520.0, 11416.0], [525.0, 11876.0], [524.0, 11784.0], [527.0, 11761.0], [513.0, 11694.0], [512.0, 11140.0], [515.0, 12598.0], [514.0, 12533.0], [517.0, 13138.0], [516.0, 12775.0], [519.0, 11248.0], [518.0, 10267.0], [526.0, 10945.0], [535.0, 7229.5], [534.0, 11588.0], [533.0, 12223.0], [532.0, 11773.0], [531.0, 11196.0], [530.0, 11375.0], [529.0, 12169.0], [528.0, 11400.0], [543.0, 11844.0], [542.0, 11311.0], [541.0, 12593.0], [539.0, 12776.0], [538.0, 11265.0], [537.0, 12475.0], [536.0, 12299.0], [573.0, 11165.0], [544.0, 7089.0], [546.0, 10717.0], [545.0, 12536.0], [548.0, 11860.0], [547.0, 10957.0], [559.0, 12014.0], [558.0, 11707.0], [557.0, 12629.0], [556.0, 12062.0], [555.0, 11090.0], [554.0, 12218.0], [552.0, 10987.0], [549.0, 6502.5], [561.0, 6603.5], [560.0, 11103.0], [563.0, 10667.0], [562.0, 11254.0], [565.0, 10833.0], [564.0, 10842.0], [567.0, 12703.0], [566.0, 11055.0], [572.0, 7246.5], [575.0, 11724.0], [574.0, 11462.0], [571.0, 11609.0], [570.0, 11401.0], [569.0, 11035.0], [568.0, 12578.0], [551.0, 11743.0], [550.0, 11075.0], [605.0, 10584.0], [579.0, 5881.333333333334], [591.0, 10199.0], [576.0, 11930.0], [578.0, 12767.0], [577.0, 12593.0], [590.0, 11184.0], [589.0, 11772.0], [588.0, 11104.0], [586.0, 10940.0], [585.0, 11104.0], [584.0, 11205.0], [600.0, 10822.0], [583.0, 11494.0], [582.0, 12342.0], [581.0, 11444.0], [580.0, 11836.0], [596.0, 6502.5], [595.0, 11965.0], [594.0, 10720.0], [593.0, 10660.0], [592.0, 10642.0], [597.0, 12576.0], [599.0, 12550.0], [598.0, 10728.0], [607.0, 10752.0], [606.0, 10830.0], [604.0, 11408.0], [603.0, 10578.0], [602.0, 12022.0], [601.0, 11207.0], [636.0, 11059.0], [614.0, 5413.333333333334], [611.0, 2606.0], [610.0, 11786.0], [609.0, 11181.0], [608.0, 11664.0], [613.0, 12118.0], [612.0, 11754.5], [615.0, 6664.5], [633.0, 12040.0], [632.0, 10581.0], [635.0, 10583.0], [634.0, 10800.0], [619.0, 6443.0], [618.0, 11339.0], [617.0, 11125.0], [616.0, 10861.0], [620.0, 11664.0], [622.0, 11560.0], [621.0, 10614.0], [623.0, 11132.0], [629.0, 6691.0], [631.0, 11838.0], [630.0, 11247.0], [638.0, 6722.5], [639.0, 10650.0], [624.0, 11055.0], [626.0, 11601.0], [625.0, 10445.0], [628.0, 10676.0], [627.0, 10594.0], [637.0, 10921.0], [667.0, 11062.0], [640.0, 5148.666666666666], [642.0, 10409.0], [641.0, 10524.0], [655.0, 10555.0], [654.0, 12087.0], [653.0, 11216.0], [651.0, 12042.0], [650.0, 10518.0], [649.0, 10143.0], [648.0, 10661.0], [643.0, 6796.5], [662.0, 6757.5], [663.0, 10117.0], [666.0, 5458.333333333334], [670.0, 3248.0], [671.0, 11586.0], [657.0, 10118.0], [656.0, 11641.0], [659.0, 10547.0], [658.0, 10837.0], [661.0, 10399.0], [660.0, 10894.0], [669.0, 10536.5], [665.0, 11224.0], [664.0, 10092.0], [647.0, 12178.0], [646.0, 10559.0], [645.0, 10865.0], [644.0, 11139.0], [699.0, 5605.666666666666], [673.0, 6580.5], [676.0, 7232.5], [675.0, 10465.0], [674.0, 10088.0], [677.0, 9988.0], [679.0, 10534.0], [678.0, 10020.0], [681.0, 6894.0], [687.0, 10890.0], [672.0, 10533.0], [686.0, 10881.0], [685.0, 10367.0], [684.0, 10216.0], [683.0, 9799.0], [682.0, 10857.0], [680.0, 6085.5], [691.0, 6879.0], [690.0, 10518.0], [689.0, 11592.0], [688.0, 10065.0], [693.0, 9965.0], [692.0, 11115.0], [695.0, 9906.0], [694.0, 10974.0], [703.0, 7083.0], [702.0, 10716.0], [698.0, 6889.0], [696.0, 10246.0], [700.0, 5735.333333333334], [701.0, 6847.0], [733.0, 11189.0], [704.0, 6828.0], [706.0, 11120.0], [705.0, 10147.0], [708.0, 10553.0], [707.0, 10743.0], [710.0, 10183.0], [709.0, 9917.0], [719.0, 9609.0], [718.0, 9736.0], [717.0, 10676.0], [716.0, 10299.0], [715.0, 11510.0], [714.0, 10204.5], [712.0, 10475.0], [711.0, 6099.5], [723.0, 2904.0], [722.0, 10614.0], [721.0, 10566.0], [720.0, 11075.0], [725.0, 11509.0], [724.0, 10403.0], [727.0, 10451.0], [726.0, 11322.0], [731.0, 6661.0], [735.0, 9799.0], [734.0, 11392.0], [732.0, 9605.0], [730.0, 10075.0], [729.0, 10333.0], [728.0, 10704.0], [763.0, 9748.0], [767.0, 10596.0], [753.0, 6996.5], [752.0, 9648.0], [755.0, 10563.0], [754.0, 9676.0], [756.0, 6771.0], [759.0, 6651.0], [758.0, 10422.0], [757.0, 10175.0], [762.0, 6462.0], [761.0, 11183.0], [760.0, 9759.0], [743.0, 9689.0], [742.0, 10097.0], [741.0, 10764.0], [740.0, 9576.0], [739.0, 10183.0], [738.0, 9748.0], [737.0, 10173.0], [736.0, 10322.0], [751.0, 11090.0], [750.0, 9684.0], [749.0, 9922.0], [748.0, 10350.0], [747.0, 10046.0], [746.0, 10419.0], [745.0, 10111.0], [744.0, 11012.0], [766.0, 9986.0], [765.0, 9610.0], [764.0, 9634.0], [794.0, 10154.0], [798.0, 5724.0], [769.0, 6854.0], [782.0, 7850.333333333333], [780.0, 10118.0], [779.0, 10148.0], [778.0, 10949.0], [777.0, 9614.0], [776.0, 9250.0], [783.0, 9624.0], [768.0, 10707.0], [784.0, 7016.0], [789.0, 9544.0], [788.0, 9993.0], [787.0, 9643.0], [786.0, 10063.0], [785.0, 11015.0], [790.0, 5307.0], [791.0, 4954.333333333334], [797.0, 6445.0], [799.0, 6534.5], [796.0, 9538.0], [795.0, 9389.0], [793.0, 10797.0], [792.0, 10148.0], [775.0, 10164.0], [774.0, 10249.0], [773.0, 10661.0], [772.0, 10620.0], [771.0, 10791.0], [770.0, 10873.0], [827.0, 9000.0], [831.0, 9711.0], [817.0, 6817.0], [816.0, 10189.0], [818.0, 7111.5], [820.0, 6829.0], [819.0, 9739.0], [821.0, 9491.0], [823.0, 9396.0], [822.0, 10034.0], [828.0, 6741.5], [830.0, 10600.0], [829.0, 10424.0], [826.0, 10601.0], [825.0, 9517.0], [824.0, 9988.0], [807.0, 10457.0], [806.0, 9620.0], [805.0, 9674.0], [804.0, 10438.0], [803.0, 9677.0], [802.0, 9957.0], [801.0, 10851.0], [800.0, 9770.0], [815.0, 9703.0], [813.0, 10234.0], [812.0, 10078.0], [811.0, 9431.0], [810.0, 10455.0], [809.0, 10359.0], [808.0, 9830.0], [838.0, 5146.0], [846.0, 6791.5], [847.0, 4922.6], [834.0, 6230.666666666666], [833.0, 10301.0], [832.0, 7414.0], [836.0, 6573.5], [837.0, 10226.0], [835.0, 5658.333333333333], [839.0, 5540.666666666667], [856.0, 6824.5], [863.0, 9794.0], [862.0, 9704.0], [861.0, 9335.0], [860.0, 9768.0], [859.0, 9680.0], [858.0, 9084.0], [857.0, 8914.0], [848.0, 7065.5], [850.0, 6928.5], [855.0, 10308.0], [854.0, 10777.0], [853.0, 10280.0], [852.0, 9966.0], [851.0, 8568.0], [849.0, 5076.5], [845.0, 6688.5], [844.0, 6814.5], [843.0, 7232.0], [842.0, 7229.5], [841.0, 7014.0], [840.0, 6343.0], [890.0, 9539.0], [894.0, 9499.0], [895.0, 9412.0], [881.0, 9629.0], [880.0, 9491.0], [883.0, 9975.0], [882.0, 9409.0], [885.0, 9578.0], [884.0, 9627.0], [893.0, 9141.0], [892.0, 9599.0], [891.0, 8935.0], [888.0, 9895.0], [871.0, 10142.0], [870.0, 9696.0], [869.0, 10156.0], [868.0, 10102.0], [867.0, 8693.0], [866.0, 11000.0], [865.0, 10228.0], [864.0, 9509.0], [879.0, 8774.0], [878.0, 10018.0], [877.0, 9398.0], [876.0, 9409.0], [875.0, 9472.0], [874.0, 9544.0], [873.0, 9687.0], [872.0, 9978.0], [887.0, 9818.0], [886.0, 9940.0], [922.0, 9599.0], [927.0, 10376.0], [914.0, 6704.5], [913.0, 9616.0], [912.0, 9352.0], [915.0, 9046.0], [917.0, 9659.0], [916.0, 9660.0], [919.0, 6533.0], [918.0, 5351.0], [926.0, 10051.5], [924.0, 9609.0], [923.0, 9612.0], [921.0, 9619.0], [920.0, 9610.0], [911.0, 9369.0], [897.0, 9859.0], [896.0, 9840.0], [899.0, 9285.0], [898.0, 9449.0], [901.0, 8753.0], [900.0, 9788.0], [903.0, 9738.0], [902.0, 9419.0], [910.0, 9651.0], [909.0, 9375.0], [908.0, 9330.0], [907.0, 9047.0], [906.0, 10735.0], [905.0, 9478.0], [904.0, 9073.0], [953.0, 5112.666666666667], [940.0, 6727.5], [934.0, 6793.5], [937.0, 5367.333333333333], [936.0, 5370.0], [938.0, 5041.25], [939.0, 7766.0], [943.0, 6368.5], [929.0, 9402.0], [928.0, 10151.0], [931.0, 9304.0], [930.0, 9558.0], [933.0, 8268.0], [932.0, 10565.0], [942.0, 7737.0], [941.0, 10214.0], [944.0, 6366.0], [959.0, 4918.0], [958.0, 6482.0], [952.0, 8695.0], [935.0, 8641.0], [954.0, 8659.0], [956.0, 8640.0], [955.0, 8638.0], [957.0, 6652.0], [945.0, 5322.666666666667], [949.0, 6617.5], [948.0, 8356.0], [946.0, 8708.0], [950.0, 5775.5], [951.0, 8691.0], [986.0, 6129.0], [961.0, 5770.666666666667], [960.0, 4559.8], [975.0, 8451.0], [974.0, 8435.0], [965.0, 5545.666666666667], [964.0, 8579.0], [963.0, 8483.0], [962.0, 8607.0], [967.0, 8544.0], [966.0, 9883.0], [985.0, 9389.0], [984.0, 8376.0], [968.0, 5760.5], [970.0, 8288.0], [969.0, 8140.0], [972.0, 9431.0], [971.0, 8443.0], [973.0, 5761.333333333333], [976.0, 6379.5], [977.0, 7681.0], [979.0, 8153.0], [978.0, 8098.0], [981.0, 8960.0], [980.0, 8400.0], [983.0, 8921.0], [982.0, 8199.0], [991.0, 9320.0], [990.0, 8293.0], [989.0, 5693.0], [988.0, 6343.5], [987.0, 8806.0], [1020.0, 5142.25], [1006.0, 6110.333333333333], [993.0, 5899.5], [994.0, 5381.0], [995.0, 5894.333333333333], [996.0, 7851.0], [998.0, 8152.0], [997.0, 7516.0], [1016.0, 7981.0], [999.0, 8670.0], [1019.0, 7969.0], [1018.0, 8164.0], [1023.0, 5495.0], [1008.0, 8081.0], [1010.0, 8042.0], [1009.0, 8057.0], [1022.0, 4838.333333333333], [1021.0, 6346.5], [1011.0, 5876.5], [1013.0, 4527.6], [1012.0, 7243.0], [1015.0, 5044.25], [1014.0, 5481.0], [1001.0, 5977.5], [1000.0, 9242.0], [1004.0, 4954.0], [1003.0, 6186.5], [1002.0, 8086.0], [1005.0, 5394.666666666667], [1007.0, 6359.0], [992.0, 9342.0], [1028.0, 5367.0], [1072.0, 6320.0], [1024.0, 6346.5], [1054.0, 7656.0], [1052.0, 8408.0], [1048.0, 5960.5], [1050.0, 6015.333333333333], [1046.0, 4857.333333333333], [1044.0, 5260.0], [1040.0, 5675.0], [1042.0, 6013.5], [1026.0, 4683.142857142857], [1030.0, 4877.8], [1032.0, 7855.0], [1034.0, 7853.0], [1036.0, 5819.0], [1074.0, 4880.5], [1076.0, 5310.5], [1084.0, 5203.5], [1086.0, 5776.25], [1056.0, 7677.0], [1082.0, 4780.142857142857], [1080.0, 8286.0], [1078.0, 8246.0], [1058.0, 6283.5], [1060.0, 8544.0], [1062.0, 8950.0], [1064.0, 8647.0], [1066.0, 5465.333333333333], [1068.0, 8242.0], [1070.0, 6404.0], [1038.0, 4889.75], [1092.0, 6361.0], [1088.0, 6399.5], [1104.0, 5370.2], [1108.0, 6019.0], [1112.0, 5367.75], [1116.0, 5859.666666666667], [1114.0, 5534.777777777777], [1110.0, 6564.0], [1106.0, 8045.0], [1090.0, 6607.0], [1096.0, 6608.5], [1094.0, 7809.0], [1098.0, 6178.0], [1102.0, 5894.0], [1100.0, 9036.0], [1120.0, 6551.5], [1122.0, 7077.0], [1150.0, 8483.0], [1148.0, 8026.0], [1138.0, 7834.5], [1136.0, 7673.0], [1140.0, 6975.0], [1142.0, 8802.0], [1144.0, 5201.6], [1146.0, 5214.916666666666], [1124.0, 5790.75], [1130.0, 6102.666666666667], [1128.0, 7966.0], [1126.0, 8119.5], [1132.0, 5701.0], [1134.0, 8321.0], [1200.0, 7803.0], [1166.0, 5887.833333333333], [1156.0, 5617.0], [1154.0, 6379.666666666667], [1158.0, 7340.0], [1160.0, 8235.0], [1162.0, 6658.0], [1164.0, 7485.0], [1202.0, 6516.0], [1204.0, 8323.0], [1206.0, 6999.0], [1208.0, 7163.0], [1210.0, 7813.0], [1212.0, 7406.0], [1184.0, 8370.0], [1186.0, 7467.0], [1188.0, 7434.0], [1190.0, 8015.0], [1192.0, 7600.0], [1194.0, 7965.0], [1196.0, 7455.0], [1198.0, 7432.0], [1214.0, 8107.0], [1168.0, 5771.5], [1170.0, 5780.0], [1172.0, 8167.0], [1174.0, 7295.0], [1176.0, 8424.0], [1178.0, 8216.0], [1180.0, 7511.0], [1152.0, 6909.0], [1182.0, 7157.0], [1272.0, 7786.0], [1268.0, 7242.0], [1276.0, 7439.0], [1248.0, 7227.0], [1250.0, 7398.0], [1252.0, 7509.0], [1254.0, 8031.0], [1256.0, 7652.0], [1258.0, 7661.0], [1260.0, 7442.0], [1262.0, 7277.0], [1278.0, 6535.0], [1274.0, 7632.0], [1270.0, 7415.0], [1266.0, 7243.0], [1264.0, 7630.0], [1216.0, 7658.0], [1218.0, 6385.0], [1220.0, 7073.0], [1222.0, 6362.0], [1224.0, 7505.0], [1226.0, 6907.0], [1228.0, 7485.0], [1230.0, 8419.0], [1246.0, 7348.0], [1244.0, 7163.0], [1242.0, 7671.0], [1240.0, 7706.0], [1238.0, 7366.0], [1236.0, 7913.0], [1234.0, 7756.0], [1232.0, 7839.0], [1332.0, 6219.75], [1320.0, 6216.5], [1334.0, 5909.5], [1336.0, 5971.5], [1312.0, 6847.0], [1342.0, 7080.0], [1340.0, 6206.0], [1338.0, 7151.0], [1314.0, 6508.0], [1316.0, 5964.0], [1318.0, 6282.5], [1322.0, 6128.5], [1324.0, 6483.5], [1330.0, 6515.75], [1328.0, 6703.25], [1294.0, 7355.0], [1292.0, 7051.0], [1290.0, 7238.0], [1288.0, 7350.0], [1286.0, 6864.0], [1284.0, 7241.0], [1282.0, 6375.0], [1280.0, 7817.0], [1310.0, 6639.666666666667], [1308.0, 6115.333333333333], [1306.0, 7128.0], [1302.0, 6695.0], [1300.0, 7139.0], [1298.0, 7216.0], [1296.0, 6512.0], [1326.0, 6205.0], [1354.0, 6373.0], [1364.0, 6176.333333333333], [1344.0, 6864.0], [1346.0, 7975.0], [1374.0, 6260.0], [1372.0, 6443.0], [1370.0, 6610.0], [1368.0, 7111.0], [1348.0, 7027.0], [1350.0, 7275.0], [1356.0, 6367.0], [1352.0, 7065.0], [1358.0, 6452.0], [1392.0, 6308.0], [1394.0, 6424.0], [1404.0, 6411.0], [1400.0, 6150.0], [1398.0, 6682.0], [1396.0, 6853.0], [1376.0, 6820.0], [1378.0, 6023.0], [1380.0, 8438.0], [1406.0, 6436.0], [1382.0, 6886.0], [1384.0, 6585.0], [1386.0, 6600.0], [1390.0, 6418.5], [1388.0, 6684.0], [1360.0, 7019.0], [1362.0, 6911.0], [1410.0, 6306.0], [1408.0, 6316.0], [1418.0, 6095.0], [1416.0, 6493.0], [1414.0, 6496.0], [1412.0, 6490.0], [1420.0, 6287.0], [1422.0, 6710.0], [1424.0, 6100.0], [1426.0, 6418.0], [1430.0, 7577.0], [1428.0, 7673.0], [1432.0, 7548.0], [1434.0, 6224.0], [1436.0, 6694.0], [1029.0, 4709.75], [1027.0, 5194.666666666667], [1025.0, 4480.125], [1055.0, 8515.0], [1051.0, 5226.0], [1053.0, 6142.0], [1049.0, 8731.0], [1045.0, 6466.0], [1043.0, 5758.5], [1047.0, 5031.25], [1041.0, 7826.0], [1031.0, 8808.0], [1033.0, 7855.0], [1035.0, 9066.0], [1037.0, 6645.0], [1039.0, 4702.571428571428], [1073.0, 6349.0], [1075.0, 4890.666666666667], [1083.0, 5255.833333333334], [1085.0, 6148.5], [1087.0, 5521.25], [1057.0, 8280.0], [1081.0, 8191.0], [1079.0, 9353.0], [1077.0, 9113.0], [1061.0, 6169.0], [1059.0, 8141.0], [1063.0, 8143.0], [1065.0, 8152.0], [1067.0, 6129.0], [1069.0, 7528.0], [1071.0, 8062.0], [1091.0, 4763.0], [1105.0, 5585.666666666667], [1115.0, 5038.615384615384], [1119.0, 7436.0], [1117.0, 8202.0], [1113.0, 5079.5], [1111.0, 5540.75], [1109.0, 7169.0], [1107.0, 6648.5], [1089.0, 4939.0], [1095.0, 7291.0], [1093.0, 8305.0], [1097.0, 5382.0], [1099.0, 5837.5], [1101.0, 7257.0], [1103.0, 6441.5], [1121.0, 8106.0], [1151.0, 7563.0], [1147.0, 4574.5], [1149.0, 6001.666666666667], [1139.0, 6351.5], [1141.0, 7912.0], [1143.0, 5475.0], [1145.0, 6691.666666666667], [1125.0, 4681.0], [1129.0, 7799.0], [1127.0, 8401.0], [1133.0, 5802.333333333333], [1135.0, 8289.0], [1131.0, 5772.8], [1123.0, 5450.0], [1201.0, 7434.0], [1159.0, 7039.0], [1157.0, 5754.875], [1155.0, 6358.666666666667], [1161.0, 5781.0], [1165.0, 6470.5], [1163.0, 7556.0], [1167.0, 5460.4], [1203.0, 8199.0], [1205.0, 7363.0], [1207.0, 7763.0], [1209.0, 7790.0], [1211.0, 7833.0], [1213.0, 8105.0], [1215.0, 7290.0], [1185.0, 7483.0], [1187.0, 7666.0], [1189.0, 8226.0], [1191.0, 7190.0], [1193.0, 7330.0], [1195.0, 7089.0], [1197.0, 8321.0], [1199.0, 7205.0], [1171.0, 7729.0], [1173.0, 6742.0], [1175.0, 7649.0], [1177.0, 7986.0], [1179.0, 8309.0], [1181.0, 7269.0], [1183.0, 8226.0], [1153.0, 8438.0], [1169.0, 6379.5], [1277.0, 7270.0], [1279.0, 7755.0], [1249.0, 7752.0], [1251.0, 7117.0], [1253.0, 6826.0], [1255.0, 7785.0], [1257.0, 7212.0], [1259.0, 7076.0], [1261.0, 7221.0], [1263.0, 7811.0], [1275.0, 7614.0], [1273.0, 7155.0], [1271.0, 7446.0], [1269.0, 7980.0], [1267.0, 7222.0], [1265.0, 7350.0], [1247.0, 7355.0], [1217.0, 7890.0], [1219.0, 8483.0], [1221.0, 7299.0], [1223.0, 7980.0], [1225.0, 7563.0], [1227.0, 7459.0], [1229.0, 8297.0], [1231.0, 8022.0], [1245.0, 7141.0], [1243.0, 7871.0], [1241.0, 6989.0], [1239.0, 6214.0], [1237.0, 6784.0], [1235.0, 7364.0], [1233.0, 7087.0], [1331.0, 6235.8], [1343.0, 6644.0], [1333.0, 6380.75], [1335.0, 7112.0], [1313.0, 5886.25], [1341.0, 7160.0], [1339.0, 7129.0], [1337.0, 6382.0], [1315.0, 5725.6], [1317.0, 6132.2], [1319.0, 6198.333333333333], [1321.0, 5781.857142857143], [1323.0, 6139.0], [1325.0, 6374.333333333333], [1329.0, 7043.333333333333], [1295.0, 7536.0], [1293.0, 7136.0], [1291.0, 7476.0], [1289.0, 7471.0], [1287.0, 7118.0], [1285.0, 7473.0], [1283.0, 7948.0], [1281.0, 7359.0], [1311.0, 6697.0], [1309.0, 6182.333333333333], [1307.0, 7004.0], [1305.0, 7613.5], [1303.0, 7818.0], [1301.0, 7324.0], [1299.0, 6385.0], [1297.0, 7553.0], [1327.0, 7071.333333333333], [1351.0, 6570.0], [1347.0, 6362.75], [1345.0, 6226.5], [1375.0, 7036.0], [1373.0, 6152.0], [1371.0, 6983.0], [1369.0, 6757.0], [1367.0, 6269.333333333333], [1365.0, 6852.0], [1349.0, 6542.5], [1355.0, 7340.0], [1353.0, 6275.0], [1357.0, 6459.0], [1359.0, 6669.0], [1393.0, 6083.0], [1395.0, 6858.5], [1405.0, 6334.333333333333], [1403.0, 6555.0], [1401.0, 5852.0], [1399.0, 6708.0], [1397.0, 6603.0], [1407.0, 6096.0], [1377.0, 6349.0], [1379.0, 6868.0], [1381.0, 6414.0], [1385.0, 6518.5], [1383.0, 6389.0], [1387.0, 6414.5], [1391.0, 8147.0], [1389.0, 6925.5], [1361.0, 5576.0], [1363.0, 6272.0], [1409.0, 6528.0], [1437.0, 6118.0], [1411.0, 5945.5], [1419.0, 6100.5], [1417.0, 6322.0], [1415.0, 6533.0], [1413.0, 6040.0], [1421.0, 7759.0], [1423.0, 6164.0], [1427.0, 6716.2], [1425.0, 6105.0], [1431.0, 6373.5], [1429.0, 6237.0], [1433.0, 6611.0], [1435.0, 7461.0], [1.0, 13716.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[792.9084999999989, 8615.556499999993]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1437.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 262.5, "minX": 1.54960818E12, "maxY": 13737.5, "series": [{"data": [[1.54960824E12, 13737.5], [1.54960818E12, 294.6333333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960824E12, 12237.5], [1.54960818E12, 262.5]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960824E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 1006.4047619047618, "minX": 1.54960818E12, "maxY": 8778.776302349328, "series": [{"data": [[1.54960824E12, 8778.776302349328], [1.54960818E12, 1006.4047619047618]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960824E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 1006.3809523809523, "minX": 1.54960818E12, "maxY": 8778.773237997953, "series": [{"data": [[1.54960824E12, 8778.773237997953], [1.54960818E12, 1006.3809523809523]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960824E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 30.166666666666657, "minX": 1.54960818E12, "maxY": 99.0975485188968, "series": [{"data": [[1.54960824E12, 99.0975485188968], [1.54960818E12, 30.166666666666657]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960824E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 464.0, "minX": 1.54960818E12, "maxY": 14648.0, "series": [{"data": [[1.54960824E12, 14648.0], [1.54960818E12, 1659.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960824E12, 1426.0], [1.54960818E12, 464.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960824E12, 13067.1], [1.54960818E12, 1548.7000000000003]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960824E12, 14043.95], [1.54960818E12, 1659.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960824E12, 13672.8], [1.54960818E12, 1634.45]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960824E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 1276.5, "minX": 0.0, "maxY": 8694.0, "series": [{"data": [[0.0, 1276.5], [32.0, 8694.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 32.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 1276.5, "minX": 0.0, "maxY": 8694.0, "series": [{"data": [[0.0, 1276.5], [32.0, 8694.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 32.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 5.933333333333334, "minX": 1.54960818E12, "maxY": 27.4, "series": [{"data": [[1.54960824E12, 27.4], [1.54960818E12, 5.933333333333334]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960824E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.7, "minX": 1.54960818E12, "maxY": 32.63333333333333, "series": [{"data": [[1.54960824E12, 32.63333333333333], [1.54960818E12, 0.7]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960824E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.7, "minX": 1.54960818E12, "maxY": 32.63333333333333, "series": [{"data": [[1.54960824E12, 32.63333333333333], [1.54960818E12, 0.7]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960824E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
